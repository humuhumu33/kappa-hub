# Roadmap

Milestones in dependency order. Each has concrete tasks and an
acceptance test that fails before the work and passes after.
Refer to [docs/DESIGN.md](docs/DESIGN.md) for rationale and
[docs/PROMPT.md](docs/PROMPT.md) for the agent-facing version.

## M0 — Single node

Goal: one machine runs a complete hub. A model flows
HF repo → `.holo` → kappa blobs → `from_pretrained`.

Tasks:

1. `holo model import` compile target in hologram-live `src/compile.rs`:
   reads a standard HF repo (config.json, safetensors shards,
   tokenizer files, README.md card), chunks weights per the LargeModel
   profile, emits a `.holo` v4 with `InferenceModel` + `View` layers.
2. LargeModel chunking profile spec: 64–256 MiB shards, manifest object,
   `chunk-manifest` edges. Write it as a document plus codec tests
   before the importer.
3. `KappaRegistryProvider` implementing `trait RegistryProvider`
   (`src/registry.rs:11-22`): put/get/list objects against kappa OCI
   blob endpoints.
4. `ConfiguredResolver` implementing the reserved variant
   (`src/application_plan.rs:50-55`): thin-archive κ resolution from a
   kappa peer with fail-closed re-hash.
5. `dev.hologram.live.hub` `LiveModule` (`src/modules/mod.rs:13-41`):
   `GET /api/models`, `GET /api/models/{repo}/tree/{rev}`,
   `GET /{repo}/resolve/{rev}/{path}` (Range-capable proxy to κ blobs),
   `POST /api/models`.
6. BDD suites under `features/suites/`: hub_shim, model_import,
   peer_resolution.

Acceptance:

- `HF_ENDPOINT=http://localhost:5000` and
  `transformers.AutoModel.from_pretrained("org/model")` succeed with
  zero code changes.
- Two consecutive imports of the same HF repo produce byte-identical
  `application_kappa`.
- Range-backed partial read of a shard returns the same bytes as a full
  read slice (safetensors mmap semantics preserved).

## M1 — Federation

Goal: two nodes behave as one hub; sync cost is the difference.

Tasks:

1. Two-node test rig: `KAPPA_FEDERATION_PEERS`, signed epoch probes,
   equivocation detection.
2. RBSR namespace sync exercised on a real model namespace.
3. Delta bundle transfer for one changed shard of a 7B model.
4. Mirror-mode hologram config: daemon pulls from any peer by κ.

Acceptance:

- One changed shard in a 7B model transfers O(one shard) bytes between
  peers; no full re-upload.
- Kill the primary node mid-download; the client completes from the
  peer and verification passes.

## M2 — Provenance

Goal: lineage and claims are queryable signed graph data.

Tasks:

1. Publisher assertion flow over `application_kappa` (assert, resolve,
   revoke).
2. Quantization and fine-tune as `derived-from` edges; eval results as
   `assertion` + `evidence-provenance`.
3. Gated pulls as capability edges with TTL and cascading revocation.
4. Descendant-tree graph query endpoint in the hub module.
5. Absence proofs for moderation states.

Acceptance:

- Graph query returns the full descendant tree of a base model; every
  edge verifies against its asserter anchor.
- Revoking a delegation cascades; a previously authorized pull fails
  closed.

## M3 — Compute network

Goal: models run on nodes other than the caller's.

Tasks:

1. Engine implementation: uor-r4 or llama.cpp per
   `docs/superpowers/plans/2026-09-03-*.md`.
2. Slot advertisement records (AT-Proto) from compute nodes.
3. Delegated remote run: caller delegation edge to provider anchor;
   `.holo` resident execution on the provider; honest usage reporting;
   `finish_reason: "abstain"` preserved.
4. Audit trail: capability admission decisions on the provider logged
   to `audit.jsonl`.

Acceptance:

- A Space `.holo` runs unmodified on a remote node.
- Every admission decision appears in the provider's audit log.

## M4 — P2P

Goal: federation without infrastructure.

Tasks:

1. Veilid transport (`--features veilid`) between two NAT'd peers.
2. Handle-verified social records (discussions, likes) on AT-Proto.
3. Mirror without open ports.

Acceptance:

- Two nodes behind consumer NATs converge; a third client resolves and
  downloads from either.
