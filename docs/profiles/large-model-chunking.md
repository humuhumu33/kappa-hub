# LargeModel Chunking Profile v1

Status: draft, target M0 of [ROADMAP.md](../../ROADMAP.md).
Implementations: hologram-live `src/hub_manifest.rs` (codec and chunker),
kappa-registry OCI blob transport.

## Purpose

Model weights exceed the kappa blob cap (256 MiB default,
`KAPPA_MAX_BLOB_SIZE`) and must move between nodes with minimal transfer
on revision changes. This profile defines the artifact that makes
sharded weights content-addressed, verifiable, and delta-transferable
across any kappa hub node. It is a first-class spec: every consumer
(hub shim, peer resolver, importer) shares this codec, so a loose
convention is not acceptable.

## Addressing

- Every address is a BLAKE3 kappa label: `blake3:` + 64 lowercase hex
  characters. This is hologram's native κ and a native kappa
  `KappaLabel` axis (`Axis::Blake3`), so no digest translation is
  needed anywhere in the stack.
- A blob's κ is `blake3(bytes)`. Verification is intrinsic: re-hash on
  read, fail closed on mismatch (both hologram's store and kappa's
  `verify_kappa` do this).

## Repo manifest

A model repository is a single canonical JSON object:

```json
{
  "format": "kappahub.repo-manifest/v1",
  "name": "org/repo",
  "files": [
    {
      "path": "model-00001-of-00002.safetensors",
      "size": 243,
      "media_type": "application/octet-stream",
      "chunks": [
        { "kappa": "blake3:…", "offset": 0, "size": 243 }
      ]
    }
  ]
}
```

Canonical encoding rules (all MUST hold; the revision κ depends on
them):

1. UTF-8, compact `serde_json` output (no whitespace beyond string
   contents), fields in the declared order, files sorted lexicographically
   by `path`.
2. `format` is exactly `kappahub.repo-manifest/v1`.
3. `name` is `namespace/repo`; both parts non-empty; characters limited
   to `[A-Za-z0-9._-]` (Hugging Face repo ids are case-preserving);
   exactly one `/`; no leading, trailing, or doubled dots beyond the
   charset rule.
4. `path` is repo-relative: no leading `/`, no `\`, no `.` or `..`
   segments, no control characters, unique across `files`.
5. `media_type` is optional; default `application/octet-stream`.
6. `chunks` are ordered by `offset`, contiguous from `0`, sizes sum to
   `size`, no chunk larger than `MAX_BLOB_BYTES`, no `size` of `0`.
7. A file of `size == 0` has `chunks: []`.

The **revision** of a repo state is the κ of the canonical manifest
bytes. It is not stored inside the manifest (self-reference is
impossible); it is the object's content address everywhere — local
store, kappa blob endpoint, hub API responses.

## Chunking

- `CHUNK_TARGET_BYTES = 128 MiB` (134217728).
- `MAX_BLOB_BYTES = 256 MiB` (268435456, kappa default).
- A file with `size <= MAX_BLOB_BYTES` is one chunk (`offset 0`).
- Larger files are split at fixed `CHUNK_TARGET_BYTES` boundaries; the
  final chunk carries the remainder. This keeps shard count and shard
  addresses stable under small appended edits.
- Chunk κs are independent blobs; the manifest is the only authority
  for reassembly order.

## Delta transfer

Because chunks are addressed independently, a revision change that
alters one shard re-uploads only that shard's changed chunks. A
manifest revision costs one small JSON blob. Delta bundle transport
(`_bundle/create` with `delta: true`) applies on top for
multi-object sync between peers; it is not required for single-repo
publish.

## HTTP transport (kappa OCI)

All endpoints on any kappa hub node; namespace defaults to
`hologram`:

| Operation | Endpoint |
|---|---|
| PUT chunk blob | `PUT /v2/{ns}/blobs/blake3:{hex}` (monolithic; fits cap by construction) |
| GET chunk / whole file chunk | `GET /v2/{ns}/blobs/blake3:{hex}` (Range: bytes supported server-side) |
| HEAD existence/size | `HEAD /v2/{ns}/blobs/blake3:{hex}` |
| PUT manifest (as blob) | `PUT /v2/{ns}/blobs/blake3:{manifest-hex}` |
| Bind metadata tag | `PUT /v2/{ns}/manifests/k{manifest-hex}` (OCI tag; tag grammar forbids `/` and `:`) |
| Resolve by revision | `GET /v2/{ns}/manifests/k{manifest-hex}` |
| List revisions | `GET /v2/{ns}/tags/list` filtered to the `k` prefix |

kappa verifies every digest on ingest (`verify_kappa`), so a hostile
upload cannot shadow an existing κ. hologram re-hashes on read
independently; the two checks are redundant by design.

## Reassembly

To materialize a file: fetch chunks in manifest order, verify each
chunk's κ before use, concatenate. Partial reads (`Range`) map onto the
chunk list by offset arithmetic and never read chunks outside the
requested window.

## Versioning

`format` changes on any breaking schema change. Consumers MUST refuse
unknown `format` values. Additive optional fields keep `v1`.
