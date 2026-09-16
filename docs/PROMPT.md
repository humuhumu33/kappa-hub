# PROMPT — Kappa Hub implementation

Master prompt for agent sessions executing the design in
[DESIGN.md](DESIGN.md). Hand this to a coding agent as-is.

---

You are a Rust systems engineer and decentralized-infrastructure
architect. You work in two repos: `hologram-live` (local-first module
host, `.holo` v4 archives,
`C:\Users\pavel\Desktop\hologram-live-main\hologram-live-main`) and
`kappa-registry` (multi-protocol content-addressed server,
github.com/UOR-Foundation/kappa-registry). You build on their existing
seams. You do not fork or rewrite either.

## Mission

Build Kappa Hub: a federated, self-verifying equivalent of the Hugging
Face Hub, composed almost entirely of existing technology. A model
published once is verifiable end-to-end without trusting any platform;
any node is a full hub; nodes sync in O(difference); compute runs
wherever the user's archive is admitted.

## First principles (why this shape)

1. HF's real products are: versioned artifact storage, identity and
   access, discovery, compute, social layer, library compatibility.
   Decentralizing means replacing trust in a platform with trust in
   content — not reimplementing the website.
2. HF's Xet chunking and dedup are valuable only because files are big
   and shared. Content addressing (BLAKE3 kappa) gives that for free.
   So the unit of distribution is not a "repo of loose files" but a
   self-verifying application: the `.holo` archive.
3. Discovery is a gossip problem, not a search-engine problem. AT
   Protocol records + firehose + range-based set reconciliation solve
   it without crawlers.
4. Adoption is decided by the compatibility wedge: existing
   `transformers` / `diffusers` code must work unchanged by setting
   `HF_ENDPOINT` to any Kappa Hub node.

## HF to stack mapping (authoritative)

| Hugging Face | Kappa Hub |
|---|---|
| Model repo | `.holo` v4 archive: `InferenceModel` layer (weights kappa), optional Wasm/Python preproc layer, `View` layer = model card (HOLOVIEW), `application_kappa` = canonical identity stable across repackaging |
| Dataset repo | Namespace: S3 surface for files + Git surface for the card, linked to consumers via typed edges (`composed-of`, `derived-from`) |
| Xet chunking/dedup | Kappa blobs + `chunk-manifest` edges + delta bundles; define a LargeModel chunking profile (64-256 MiB shards, manifest object lists shard kappas) |
| Users / orgs | Kappa identity anchors (Ed25519); org = delegation chain, narrowing invariant enforced; handles via AT-Proto/DNS/WebFinger verification |
| Gated models | Capability edges with scoped operations + TTL + depth <= 5; revocation cascades |
| Model card metadata, evals, quantizations, fine-tunes | Typed edges with signed assertions: `derived-from`, `certified-by`, `assertion`, `revocation`, `evidence-provenance`. "All certified-quantized descendants of X" is a graph query |
| Spaces | `.holo` with `View` + Wasm/Python layers run as resident sessions (`holo load/run`); capability admission by host; identical behavior on laptop, GPU box, or rented node |
| Inference Providers / ZeroGPU | `InferenceEngine` implementations (uor-r4, llama.cpp per existing plans); compute nodes advertise resident slots; access via delegation edges |
| Download stats | Kappa monotonic sequences + SSE events; no global tracker |
| Discussions / PRs / likes | AT Protocol records on the same substrate (per-user MST, firehose, CAR export) |
| Git versioning | Kappa Git smart HTTP + LFS (already implemented) |
| Hub API | Compatibility shim (below) |

## Architecture — five layers

1. **Identity**: kappa anchors and assertions. Assert authorship of an
   `application_kappa` as `assertion` edges signed by the publisher
   anchor. Key rotation via succession (compromise voids old
   assertions). Handles for humans; anchors for artifacts.
2. **Artifacts**: one new compile target in hologram's `src/compile.rs`:
   `holo model import` converts an existing HF repo (config.json,
   safetensors shards, tokenizer, README card) into a `.holo` with an
   `InferenceModel` layer plus the LargeModel chunk profile. Provenance
   of the conversion is itself a signed assertion edge.
3. **Distribution**: kappa-registry as the hub node. Federation already
   exists: signed epoch probes detect equivocation; RBSR reconciliation
   syncs only the difference; `kappa-transport-veilid` (feature flag)
   gives P2P transport for nodes behind NAT. Mirrors are peers, not
   fans.
4. **Compute**: hologram daemon residents. Implement the two reserved
   seams: `RegistryProvider` (`src/registry.rs:11`) and
   `ResolutionSource::ConfiguredResolver` (`src/application_plan.rs:50`)
   so `holo plan` resolves missing kappas from kappa peers, re-hashing
   everything fail-closed. A compute node = a kappa peer + hologram
   daemon + advertised `InferenceEngine` slots in an AT-Proto record.
5. **Social & discovery**: kappa's AT Protocol surface. Card = record;
   discussion = thread records; like/collection = records; firehose =
   global feed; inclusion and absence proofs = portable moderation
   states.

## Integration seams (exact, use these — do not invent new ones)

hologram-live:

- `trait RegistryProvider` — `src/registry.rs:11-22`: implement
  `KappaRegistryProvider`.
- `ResolutionSource::ConfiguredResolver` —
  `src/application_plan.rs:50-55`: peer resolution hook for thin
  archives.
- `trait InferenceEngine` — `src/inference/mod.rs:130-181`: add uor-r4 /
  llama.cpp per `docs/superpowers/plans/2026-09-03-*.md`.
- `trait LiveModule` + `builtin_modules!` — `src/modules/mod.rs:13-41`:
  new `dev.hologram.live.hub` module serving the HF-compatible API.
- Kappa side: OCI blob endpoints (range requests, chunked upload) for
  shard transfer; `_bundle/create|ingest` and `_reconcile` for sync;
  `_identity/assert|resolve|absence` for provenance;
  `KAPPA_AUTH_TOKENS` (token=anchor) for auth; `chunk-manifest` edge
  relation for the LargeModel profile; keep hologram's trust choke
  points (`store.verify`, `holo_graph` closure limits, capability
  admission, `audit.jsonl`) untouched.

## Compatibility wedge (build this first)

New `LiveModule` implementing the HF API surface: `GET /api/models`,
`GET /api/models/{repo}/tree/{rev}`,
`GET {repo}/resolve/{rev}/{path}` (proxied to kappa blobs with correct
Content-Length; support `Range`), `POST /api/models` upload. Then
`HF_ENDPOINT=http://localhost:5000` works with stock `huggingface_hub`,
`transformers`, `diffusers`. Acceptance:
`transformers.AutoModel.from_pretrained("org/model")` succeeds against
a local Kappa Hub with zero code changes.

## Non-goals (v1)

No training or fine-tuning jobs. No embeddings/vector search (lexical +
tags first; hologram has none and forbids fabricated vectors). No
browser wallet/blockchain. No replacing HF for private-team SSO.

## Milestones

- **M0 — Single node.** kappa-registry + hologram daemon on one
  machine. `holo model import` from a real HF repo; `.holo`
  import/verify/plan against kappa blobs; HF shim serves it.
  Acceptance: `from_pretrained` via `HF_ENDPOINT`, byte-identical
  `application_kappa` across two imports.
- **M1 — Federation.** Two kappa peers, signed epoch probes, RBSR sync
  of a namespace, delta bundles for a 7B model with one changed shard.
  Acceptance: O(changed shards) bytes transferred.
- **M2 — Provenance.** Publisher assertions, quantization/fine-tune as
  `derived-from` edges, eval results as `assertion` +
  `evidence-provenance`, revocation cascade, absence proofs.
  Acceptance: graph query returns full descendant tree with verifying
  signatures.
- **M3 — Compute network.** uor-r4 or llama.cpp engine; nodes advertise
  slots via AT-Proto records; delegated remote run of a `.holo`; honest
  token-usage reporting; `finish_reason: "abstain"` preserved.
  Acceptance: Space runs unmodified on remote node; capability
  admission and audit trail present.
- **M4 — P2P.** Veilid transport between two NAT'd peers;
  handle-verified social records; mirror without open ports.

## Risks and gaps (state these in your plan)

256 MiB kappa blob cap requires the LargeModel profile to be a
first-class spec, not a convention. AT Protocol feature is opt-in
(`--features atproto`) — document node requirements. HF sharded-index
and `safetensors` mmap semantics need Range-backed reads to stay fast.
Model `kind` metadata (`ObjectMetadata.media_type`) must distinguish
`model` blobs from shard caches. Hallucinated metadata is forbidden:
only re-derived, re-hashed facts enter the directory.

## Verification

Run hologram's `just verify` and kappa's `cargo test --workspace`,
`./scripts/conformance.sh`, `./scripts/oci-conformance.sh` after each
milestone. New BDD suites under `features/suites/` for: HF shim,
chunked model import, peer resolution, delegation-gated pull. Every
claim of "decentralized" must survive: kill the primary node, verify a
client still resolves, downloads, and verifies the model from a peer,
with signatures intact.
