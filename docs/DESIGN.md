# Kappa Hub — Design

Authoritative architecture for a decentralized Hugging Face built on
hologram-live and kappa-registry. This document is the source of truth.
Line references are to hologram-live v1.0.0
(`C:\Users\pavel\Desktop\hologram-live-main\hologram-live-main`) and to
kappa-registry `main` as of September 2026.

## 1. First principles

1. Hugging Face's real products are: versioned artifact storage, identity
   and access, discovery, compute, social layer, library compatibility.
   Decentralizing means replacing trust in a platform with trust in
   content — not reimplementing the website.
2. Xet chunking and dedup are valuable only because files are big and
   shared. Content addressing gives it for free. So the unit of
   distribution is not a repo of loose files but a self-verifying
   application: the `.holo` archive.
3. Discovery is a gossip problem, not a search-engine problem. AT
   Protocol records + firehose + range-based set reconciliation solve it
   without crawlers.
4. Adoption is decided by the compatibility wedge: existing
   `transformers` / `diffusers` code must work unchanged by setting
   `HF_ENDPOINT` to any Kappa Hub node.

## 2. Artifact model

### 2.1 Model = `.holo` v4 archive

A published model is a `.holo` v4 archive (byte layout:
`apps/docs/src/pages/docs/holo-files.astro`, format gate:
`src/holo_format.rs`):

- `InferenceModel` layer — weights as opaque provider bundle, `entry`
  naming the service, `aux` = engine tag (ADR
  `specs/adrs/009-inference-model-holo-v4.md`).
- Optional `WasmCodemodule` / Python layers — tokenization,
  preprocessing, model-specific logic.
- `View` layer — the model card as a portable HOLOVIEW bundle
  (`holo_view*.rs`).
- `AppManifest` (canonical, section kind 15) — the identity of the
  model is its `application_kappa`, stable across fat/thin packaging
  (`src/application_plan.rs:14-26`). Repackaging does not change
  identity. Republishing does.

The archive is self-verifying: version gate, footer fingerprint,
application-directory re-derivation, capability round-trip, and UOR
graph closure re-hash — all fail-closed (`src/holo.rs:166-180`,
`src/holo_directory.rs:150-178`, `src/holo_capability.rs:70-80`,
`src/holo_graph.rs:44-118`).

### 2.2 Dataset = namespace + edges

A dataset is a kappa namespace: S3 surface for files, Git surface for
the card and loaders. Consumers link via typed edges (`composed-of`,
`derived-from`). No new storage format.

### 2.3 LargeModel chunking profile

Kappa caps blobs at 256 MiB by default (`KAPPA_MAX_BLOB_SIZE`). Model
weights use a first-class chunking profile, not a convention:

- Shards of 64–256 MiB, each addressed by κ.
- A manifest object listing shard κs, sizes, and per-shard BLAKE3
  (redundant with κ, kept for streaming verification).
- Manifest linked to the `InferenceModel` layer via `chunk-manifest`
  typed edges.
- Range requests on OCI blob endpoints serve partial reads
  (safetensors mmap-style loads).
- Delta bundles (`_bundle/create` with `delta: true`) transfer only
  changed shards between revisions.

## 3. Identity, access, provenance

- **Anchors**: `sha256(dCBOR(algorithm || public_key))`, deterministic
  and offline. Ed25519 default. Authors are anchors; humans get handles
  (AT-Proto / DNS TXT / WebFinger, re-verified periodically).
- **Authorship**: publisher asserts `key/signing`-style assertions over
  an `application_kappa`. Multiple assertions from different asserters
  are distinguishable facts; the substrate does not merge or score them.
- **Orgs**: delegation chains with the narrowing invariant —
  redelegation may only narrow scope, shorten TTL, decrement depth
  (max 5). Revocation cascades.
- **Gated models**: capability edges with scoped operations and TTL.
  A pull capability is a delegation edge, not a platform account flag.
- **Key rotation**: succession records create watermarks;
  `KeyCompromise` voids old assertions; ordinary rotation voids
  assertions before `effective_at_ms`. History stays queryable.
- **Moderation**: takedown / safety states are assertions with
  inclusion and absence proofs — portable between nodes, verifiable
  offline.

Lineage, evals, quantizations, and fine-tunes are typed edges
(`derived-from`, `certified-by`, `assertion`,
`evidence-provenance`, `revocation`). "All certified-quantized
descendants of X" is a graph query, not a search query.

## 4. Distribution and federation

- Any kappa node is a full hub: single binary, one port, one data
  directory.
- Federation is already implemented: `KAPPA_FEDERATION_PEERS` epoch
  probes verify signed roots and detect equivocation (one fault
  degrades; no averaging). RBSR set reconciliation with XOR-monoid
  fingerprints transfers only the difference.
- Mirrors are peers, not fans. A new mirror syncs O(difference).
- `kappa-transport-veilid` (feature flag) gives P2P transport between
  NAT'd nodes.
- Download stats: monotonic sequences + SSE events. No global tracker.

## 5. Compute

- A compute node = kappa peer + hologram daemon + advertised
  `InferenceEngine` slots (AT-Proto record).
- Engine implementations follow the existing plans:
  `docs/superpowers/plans/2026-09-03-uor-r4-engine.md` and
  `2026-09-03-llamacpp-engine.md`. Models are addressed by κ; usage
  reporting is honest; abstention surfaces as
  `finish_reason: "abstain"`.
- A Space is a `.holo` run as a resident session (`holo load/run`,
  `[[holo.resident]]`). The host enforces the archive's CapabilitySet
  (memory, CPU, network scopes, channels) and logs every admission
  decision to `audit.jsonl`. Identical behavior on laptop, GPU box, or
  rented node.
- Remote run authorization is a delegation edge from the caller's
  anchor to the compute provider's anchor.

## 6. Compatibility wedge

New `LiveModule` (`dev.hologram.live.hub`) implementing the HF API
surface:

- `GET /api/models` — discovery (lexical + tags; no fabricated
  embeddings).
- `GET /api/models/{repo}/tree/{rev}` — file listing from the archive's
  application directory.
- `GET /{repo}/resolve/{rev}/{path}` — proxied to κ blobs with correct
  `Content-Length`; `Range` supported.
- `POST /api/models` — upload (multipart, HF-style), then compile to
  `.holo`.

Acceptance: `transformers.AutoModel.from_pretrained("org/model")`
succeeds against a local node with `HF_ENDPOINT=http://localhost:5000`
and zero code changes.

## 7. Integration seams (use these; do not invent new ones)

hologram-live:

- `trait RegistryProvider` — `src/registry.rs:11-22`. Implement
  `KappaRegistryProvider`.
- `ResolutionSource::ConfiguredResolver` — `src/application_plan.rs:50-55`.
  Peer resolution of missing κs in `holo plan`; the plan machinery
  tracks per-object resolution source and re-hashes everything.
- `trait InferenceEngine` — `src/inference/mod.rs:130-181`, factory at
  `:183`.
- `trait LiveModule` + `builtin_modules!` — `src/modules/mod.rs:13-41`.
  The hub shim module.
- Model import — new compile target in `src/compile.rs` (LayerKind at
  `:90-98`); `holo model import` converts an HF repo (config.json,
  safetensors shards, tokenizer, README card) into a `.holo`.
- Trust choke points to preserve untouched: `store.verify`
  (`src/store.rs:195-199`), graph closure limits (`src/holo_graph.rs`),
  capability admission, `audit.jsonl`.

kappa-registry:

- OCI blob endpoints for shard transfer (range, chunked upload,
  multipart).
- `_bundle/create|ingest` (delta), `_reconcile` (RBSR), `_root`
  (signed), `_root/proof` (inclusion), `_identity/assert|resolve|absence`,
  `_identity/succession`, edges API (17 relation types),
  `KAPPA_AUTH_TOKENS` (`token=anchor`), identity bindings and handles,
  `--features atproto`, `--features veilid`.

## 8. Non-goals (v1)

- No training or fine-tuning jobs.
- No embeddings or vector search. Lexical + tags first. Hologram
  forbids fabricated vectors (`supports_embeddings()` default false)
  and this project inherits that stance.
- No blockchain, no token, no wallet.
- No replacing HF for private-team SSO and enterprise features.

## 9. Risks and gaps

- The 256 MiB blob cap makes the LargeModel profile spec-grade from day
  one. A loose convention here breaks every downstream consumer.
- AT Protocol is an opt-in kappa feature; node documentation must state
  requirements (`--features atproto`, DID/plc resolution).
- HF sharded index and safetensors mmap semantics need Range-backed
  reads to stay fast; verify partial-load performance in M0.
- `ObjectMetadata.media_type` must distinguish model manifests from
  shard caches to keep GC and GC roots correct (`gc/pin`, `gc/sweep`).
- Only re-derived, re-hashed facts enter the application directory.
  Hallucinated metadata is forbidden.

## 10. Verification discipline

After each milestone run:

- hologram-live: `just verify` (fmt, file-size, product-boundary,
  check, test, clippy, BDD, release build, smoke).
- kappa-registry: `cargo test --workspace`,
  `./scripts/conformance.sh` (187 kappa-distribution tests),
  `./scripts/oci-conformance.sh` (1032 OCI tests),
  `./scripts/git-e2e.sh`, `./scripts/s3-e2e.sh`, `./scripts/nix-e2e.sh`.

New BDD suites under hologram `features/suites/` for: HF shim, chunked
model import, peer resolution, delegation-gated pull.

Decentralization claim test: kill the primary node. A client must still
resolve, download, and verify the model from a peer, with signatures
intact.
