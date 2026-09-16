# Kappa Hub

A federated, self-verifying equivalent of the Hugging Face Hub, built on
[hologram-live](https://github.com/Hologram-Technologies/hologram) and
[UOR-Foundation/kappa-registry](https://github.com/UOR-Foundation/kappa-registry).

Status: **design phase**. See [docs/DESIGN.md](docs/DESIGN.md) for the architecture
and [ROADMAP.md](ROADMAP.md) for the build plan.

**Model index (live):** [humuhumu33.github.io/kappa-hub](https://humuhumu33.github.io/kappa-hub/)
lists the top trending Hugging Face models with the content address of every file,
from [hologram-api](https://github.com/humuhumu33/hologram-api). Source in [`site/`](site/);
it rebuilds daily. Local preview: `node site/scripts/data.mjs && BASE=/ node site/build.mjs`,
then serve `site/dist`. Every color, size, space and radius comes from the Hologram brand kit
(`node site/scripts/vendor-kit.mjs` re-vendors it; `node site/scripts/lint-tokens.mjs` enforces it).

## Problem

Hugging Face is a single company holding petabytes of open model weights, user
identity, download traffic, moderation state, and compute billing. Content is
verifiable only through the platform. Takedown, geo-blocking, bandwidth cost,
and trust all concentrate in one org.

## Thesis

Do not rebuild Hugging Face decentralized. Collapse it.

Hugging Face is six products: versioned artifact storage, identity and access,
discovery, compute, a social layer, and library compatibility. The hologram +
kappa stack already covers all six as one archive format plus one server:

- The unit of distribution is the `.holo` v4 archive — weights, code, model
  card, and inference engine in one content-addressed, capability-scoped,
  self-verifying bundle with a stable `application_kappa` identity.
- The hub is a kappa-registry node — a single binary already speaking OCI,
  Git, S3, Nix, and AT Protocol over one content-addressed substrate.
- Trust is intrinsic to content: BLAKE3 content addressing end to end plus
  Ed25519 identity anchors. A weight blob pulled from an untrusted peer
  verifies back to the publisher's key.
- Federation is built in: signed epoch probes, range-based set
  reconciliation (O(difference) sync), and a Veilid P2P transport for
  nodes behind NAT.
- Compute is portable: a Space is a `.holo` that runs identically on a
  laptop daemon, a GPU box, or a rented node, with capabilities enforced
  by the host and every decision in an audit trail.

## Mapping

| Hugging Face | Kappa Hub |
|---|---|
| Model repo | `.holo` v4 archive (`InferenceModel` layer + card View + engine) |
| Dataset repo | Namespace: S3 surface for files, Git surface for the card, typed edges to consumers |
| Xet chunking/dedup | Kappa blobs + `chunk-manifest` edges + delta bundles (LargeModel profile) |
| Users / orgs | Kappa identity anchors; orgs as delegation chains |
| Gated models | Capability edges: scoped, time-bounded, revocation cascades |
| Evals, quantizations, fine-tunes | Signed typed edges: `derived-from`, `assertion`, `certified-by` |
| Spaces | `.holo` resident sessions, capability-admitted by the host |
| Inference Providers | `InferenceEngine` providers (uor-r4, llama.cpp) on compute nodes |
| Download stats | Kappa monotonic sequences + SSE |
| Discussions / PRs / likes | AT Protocol records on the same substrate |
| Git versioning | Kappa Git smart HTTP + LFS (already implemented) |
| Hub API | Thin HF-compatible shim module |

The adoption wedge: existing `transformers` / `diffusers` code works
unchanged by setting `HF_ENDPOINT` to any Kappa Hub node.

## Architecture

```
        HF client (transformers, diffusers, huggingface_hub)
                          |  HF_ENDPOINT=http://node
                          v
   +------------------ KAPPA HUB NODE ------------------+
   |  kappa-registry (one binary, one substrate)        |
   |   OCI  Git  S3  Nix  AT-Proto  kappa-distribution  |
   |   blobs + redb state + identity anchors + edges    |
   +---------------------+------------------------------+
                         |  RegistryProvider / ConfiguredResolver
                         v
   +------------------ hologram daemon -----------------+
   |  .holo verify -> plan -> resident exec             |
   |  InferenceEngine (uor-r4 / llama.cpp)              |
   |  capability admission + audit.jsonl                |
   +----------------------------------------------------+
                         |  epoch probes + RBSR reconcile
                         v
                   peer kappa hub nodes (mirrors, compute, P2P via Veilid)
```

## Milestones

| Phase | Deliverable | Acceptance |
|---|---|---|
| M0 | Single node: HF repo to `.holo` import, HF shim | `from_pretrained` via `HF_ENDPOINT`; byte-identical `application_kappa` across imports |
| M1 | Federation: two peers, RBSR sync | O(changed shards) bytes for a one-shard update to a 7B model |
| M2 | Provenance graph | Signed assertions, descendant tree query, revocation cascade, absence proofs |
| M3 | Compute network | Space runs unmodified on a remote node; honest usage; audit trail |
| M4 | P2P | Two NAT'd peers mirror without open ports |

## Repository layout

- `docs/DESIGN.md` — authoritative architecture, integration seams with exact file references
- `docs/PROMPT.md` — the master prompt for agent sessions executing this design
- `ROADMAP.md` — milestone task breakdown
- `AGENTS.md` — constraints for coding agents working in this repo

## Related

- [hologram-live](https://github.com/Hologram-Technologies/hologram) — module host, `.holo` v4 archives
- [kappa-registry](https://github.com/UOR-Foundation/kappa-registry) — multi-protocol content-addressed server
- [huggingface/hub-docs](https://github.com/huggingface/hub-docs) — the platform being decentralized

## License

MIT OR Apache-2.0, matching the sibling projects. See LICENSE-MIT and LICENSE-APACHE.
