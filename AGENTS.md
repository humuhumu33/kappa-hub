# AGENTS.md

Constraints for coding agents working in this repository.

## Project

Kappa Hub is an integration project. The code lives in two sibling
repositories; this repo holds the design, roadmap, prompts, and — over
time — the hub-specific pieces that do not belong upstream (chunking
profile spec, conformance fixtures, packaging, deployment configs).

- hologram-live: `C:\Users\pavel\Desktop\hologram-live-main\hologram-live-main`
- kappa-registry: clone of https://github.com/UOR-Foundation/kappa-registry

Read `docs/DESIGN.md` and `ROADMAP.md` before writing anything.

## Hard constraints

- Do not fork hologram-live or kappa-registry. Contribute through their
  documented seams only: `RegistryProvider`,
  `ResolutionSource::ConfiguredResolver`, `InferenceEngine`,
  `LiveModule`, compile targets, kappa modules/features.
- Do not weaken trust choke points: `store.verify`, UOR graph closure
  limits, capability admission, `audit.jsonl`, fail-closed re-hash on
  every object read.
- Never fabricate metadata. Only re-derived, re-hashed facts enter the
  application directory. No synthesized embeddings, ever.
- Respect the 256 MiB kappa blob cap: all weight handling goes through
  the LargeModel chunking profile (`docs/DESIGN.md` §2.3).

## Verification

- hologram-live changes: run `just verify` (fmt, check, test, clippy,
  BDD, release build, smoke). MSRV 1.94, toolchain pinned at 1.97.1.
- kappa-registry changes: `cargo fmt --check`, `cargo clippy
  --all-targets -- -D warnings`, `cargo test --workspace`,
  `./scripts/conformance.sh`. All three gates must pass with zero
  warnings.
- New behavior gets a Cucumber suite under hologram `features/suites/`.
  Milestone acceptance criteria in `ROADMAP.md` are the definition of
  done.

## Conventions

- Commits: imperative mood, one concern per commit, e.g.
  `hub: add Range support to resolve proxy`.
- Rust 2021 edition, follow each repo's clippy deny-warnings policy.
- Windows host: use PowerShell 5.1 syntax in scripts; prefer `just`
  recipes over ad hoc commands.
- The decentralization claim test is non-negotiable: kill the primary
  node, the client must still resolve, download, and verify from a peer
  with signatures intact.
