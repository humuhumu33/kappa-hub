# Roadmap

Milestones in dependency order. Each has concrete tasks and an
acceptance test that fails before the work and passes after.
Refer to [docs/DESIGN.md](docs/DESIGN.md) for rationale and
[docs/PROMPT.md](docs/PROMPT.md) for the agent-facing version.

## M0 — Single node

Status: **accepted 2026-09-16**. Evidence below.

Goal: one machine runs a complete hub. A model flows
HF repo → manifest + chunk blobs → `from_pretrained`.

Tasks:

1. ✅ `holo model import` — daemon RPC + `hologram holo model-import`
   CLI; reads a standard HF repo (config.json, safetensors shards,
   tokenizer files, README card), chunks weights per the LargeModel
   profile, caches chunk blobs, stores one canonical repo manifest.
   (`.holo` v4 `InferenceModel` packaging deferred to the engine
   milestone; the repo manifest is the M0 artifact.)
2. ✅ LargeModel chunking profile spec:
   `docs/profiles/large-model-chunking.md`, codec
   `hologram-live src/hub_manifest.rs`, canonical-encoding tests.
3. ✅ `KappaRegistryProvider` (`trait RegistryProvider`) against kappa
   OCI blob endpoints with the BLAKE3 axis — no digest translation;
   object metadata travels as OCI tags (`k` + 64 hex).
4. ✅ `ConfiguredResolver` peer resolution — `explain_application_sourced`
   + `ResolutionSource::ConfiguredResolver(endpoint)`; peer bytes are
   re-hashed fail-closed by the planner and cached locally.
5. ✅ `dev.hologram.live.hub` module: `GET /api/models`,
   `/api/models/{ns}/{repo}`, `tree`, `resolve` (Range → 206, ETag →
   304, `x-repo-commit`), staged durable uploads + commit.
6. ✅ Acceptance, run live against a real 1M-param model
   (`tiny-random-LlamaForCausalLM`, 5 files, 5,976,799 bytes):
   - `hologram --json holo model-import humuhumu33/tiny-random-LlamaForCausalLM <dir>`
     → revision `27ec1241…`; second import byte-identical.
   - `resolve/main/config.json` and 4.1 MB `model.safetensors`
     byte-identical to source (SHA-256 compared).
   - `Range: bytes=0-7` → 206 with `content-range: bytes 0-7/4131280`.
   - `If-None-Match` → 304.
   - `HF_ENDPOINT=http://127.0.0.1:11435` with stock
     `huggingface_hub` 1.20.1 + `transformers` 5.5.4:
     `AutoModelForCausalLM.from_pretrained(...)` loads the model
     (`LOADED llama params: 1032272`) into the standard HF cache layout
     with snapshot dir = the revision kappa. Zero code changes.
   - Registry provider roundtrip: object stored through the daemon
     lands on the kappa node as a blob + metadata tag; served back
     through the daemon from kappa.
   - Range-backed partial read returns the same bytes as a full-read
     slice.

Remaining for M0 polish: kappa-node packaging docs, BDD suites under
hologram `features/suites/` (hub shim, model import, peer resolution).

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
