# Kappa Swarm — P2P weight distribution via Iroh

Design for torrent-like distribution of model weights across the hologram +
kappa stack, after studying noemaai-labs/noema-atlas. Status: design, target
milestones M-S1..M-S4 below.

## 1. What noema-atlas actually does

Atlas is an engine with pluggable transports (local, HTTP, HF, Iroh,
BitTorrent) behind one idea: **the signed manifest is the truth; sources are
only hints.** Content identity is BLAKE3; every byte is verified in flight;
failed sources are banned; identical files are stored once.

The clever parts worth copying:

1. **Leecher-only swarm aggregation.** The blob is cut into 4 MiB stripes
   fetched in parallel from all peers via ranged bao `GetRequest`s over QUIC.
   Any whole-blob seeder already answers ranged requests, so a swarm
   aggregates with zero seeder-side changes and zero protocol upgrades. A
   work-stealing queue means fast peers simply take more work — no measured
   throughput assignment, no scheduler tuning.
2. **Iroh as the wire.** QUIC threads NAT; relays fall back; content rides
   by BLAKE3 hash, so transport verification equals content verification.
   Persistent node keys, 16 MiB stream windows, `import_file(TryReference)`
   seeding with no on-disk copy, `.stripes` journal for piece-level resume.
3. **Error classification as control flow.** Retriable / poisoning /
   integrity failures map cleanly to retry / failover / quarantine / ban.

Where Atlas is weak:

- **Discovery is a single in-memory tracker.** One URL, one `Mutex`, restart
  wipes the catalog, no federation, no fallback. This is the mesh's spine and
  its single point of failure.
- **Trust is thin at the edges**: publisher keys are self-asserted inside the
  manifest; catalog metadata is "sender says"; no revocation story.
- **Integrity latency**: per-leaf Merkle roots are recorded but not streamed;
  a poisoned chunk is caught only at end-of-file.
- **The swarm unit is the whole file blob.** Two model variants sharing 90%
  of shards swarm as two unrelated blobs.

## 2. Thesis

**The chunk is the swarm unit. Kappa is the tracker. Iroh is the wire.**

Our LargeModel chunking profile already cuts every weight file into
BLAKE3-addressed chunks ≤ 256 MiB, with a canonical manifest committing to
the chunk list. Iroh addresses blobs by BLAKE3. These are the same address
space — a LargeModel chunk *is* an Iroh blob, verifiable by the same hash
the hub, the kappa substrate, and the planner already use. No digest
translation anywhere; the M0/M1 store, manifest, and verification machinery
carry over untouched.

Three consequences make this better than a port of Atlas:

1. **Cross-revision swarms.** A quantization or fine-tune that shares 90% of
   chunks with its base model joins the *same* swarm for those chunks. The
   network aggregates around content, not around repos — the dedup we proved
   in M1 becomes a routing property.
2. **Federated discovery with no SPOF.** Atlas's tracker is one process. Our
   kappa federation is already a set of mutually probing nodes that replicate
   state by range-based set reconciliation in O(difference). Provider
   announcements become ordinary kappa content, so every kappa node in the
   world is a rendezvous point, and the rendezvous state converges across
   the mesh like everything else.
3. **Provenance is a graph, not a string.** Provider identity, publisher
   assertions, license claims, and revocations ride the kappa identity and
   typed-edge machinery (M2), which gives signed announcements, revocation,
   and absence proofs — replacing Atlas's self-asserted keys with an actual
   trust substrate.

## 3. Architecture

```
   hologram daemon (seeder + leecher)
   ├─ ObjectStore: verified chunks (BLAKE3 κ)      ← already exists
   ├─ Iroh endpoint (feature "swarm")
   │    FsStore ← import(our blob files, TryReference)
   │    Router: ALPN blobs, per-connection registry (share = off ⇒ close)
   ├─ Share intent: hub.share = true ⇒ announce + seed loop
   └─ Source ladder for every chunk:
        local store → Iroh swarm → kappa HTTP peers → HF fallback

   kappa node (rendezvous, replicated)
   ├─ announce: signed provider edges, TTL, re-announced
   ├─ lookup:  inbound `providers` edges of a chunk κ → NodeTickets
   └─ federation: epoch probes + RBSR ⇒ every peer node sees the swarm

   ticket formats
   ├─ direct:   iroh BlobTicket (works with zero infrastructure)
   └─ mesh:     kappahub:<manifest-κ> (resolve via any kappa node)
```

### 3.1 Chunks as blobs (swarm unit)

Each chunk of the LargeModel profile is an independent Iroh blob. A file is
a manifest list of chunk κs; a model is a repo manifest. Swarming a file =
fetching its chunk list in parallel. No ranged bao striping is needed for
M-S1: a chunk is small enough to be a single verified `GetRequest`. Striping
inside a chunk (Atlas-style) is an optimization for the 256 MiB top end,
not a prerequisite.

### 3.2 Discovery without a single point of failure

A seeder announces, per chunk κ it holds, a signed provider record:

- kappa typed edge `providers` from the chunk κ to a provider record blob,
- or equivalently a tag `p/<chunk-hex>` → provider blob, in the hub namespace,

where the provider blob carries: iroh NodeId + direct addresses + relay
hint (the BlobTicket material), the node's kappa anchor, an expiry
timestamp, and a signature by the node's Ed25519 key. Announce every 5
minutes, TTL 15 minutes — Atlas's exact cadence, but persisted in the
substrate instead of a process-local map.

Lookup is the reverse edge query we already have: inbound `providers` edges
of a chunk κ. The result is a swarm view that (a) survives node restarts,
(b) reconciles across the federation in O(difference), (c) needs no extra
infrastructure — any kappa hub node is a tracker, and the more nodes and
seeders exist, the more redundant the rendezvous fabric becomes.

Availability of the rendezvous itself decays gracefully: if a node dies, the
next one has the same announcements. If everything is down but two peers
know each other, a direct BlobTicket still works (Atlas parity).

### 3.3 The source ladder (simplicity is the ladder)

Every chunk fetch already walks `verified_chunk` → local → kappa peers.
Iroh slots in as one more rung:

```
local → Iroh swarm (if tickets known/announced) → kappa HTTP peers → HF
```

Every rung ends in the same BLAKE3 verification, the same store, the same
manifest. A failed source is dropped for the session; bytes are only ever
written after verification. The user sees none of this — `hologram hub get
org/model` and a progress bar.

### 3.4 Sharing intent (the license gate)

`[hub] share = true` seeds what the daemon has legitimately fetched from
public sources and any explicitly imported-and-marked models. Gated repos
and private imports are never announced unless individually opted in. The
hub manifest carries the license claim; the swarm treats it as the
publisher's claim (verification of license truth is M2 provenance work, not
swarm work).

## 4. Security

- **Content**: chunks and manifests are BLAKE3-verified before any byte is
  committed; a mismatching provider is banned for the session and its bytes
  discarded (never written unverified — fail-closed, as today).
- **Announcements**: provider records are Ed25519-signed by the node key;
  the kappa anchor ties the announcement to a revocable identity with
  absence proofs (M2). Stale announcements expire by TTL.
- **Transport**: QUIC + Iroh's noise-handshake; relays only relay ciphertext.
- **Surface**: only manifest-listed files are served; no directory listing
  of the store; per-connection registry lets `share = false` cut live
  peers immediately.
- **Poisoned-chunk latency**: the chunk IS the verification unit — a bad
  chunk is rejected before write, not at end-of-file. This is strictly
  stronger than Atlas's current whole-file check.

## 5. Properties, stated honestly

- **Fast**: QUIC with wide windows; parallel across chunks and peers;
  work-stealing so fast peers dominate; no single bottleneck after the
  first chunk (the manifest still comes from a kappa node or a friend).
- **Secure**: verification is intrinsic and per-chunk; identity is anchored;
  announcements are signed and revocable; intent gating is explicit.
- **Scalable**: seeders add capacity linearly; every kappa node adds
  rendezvous capacity linearly; federation replication keeps the swarm view
  convergent at O(difference) cost.
- **Better with use**: more seeders = more chunk sources; more kappa nodes =
  more trackers; more model families sharing chunks = denser dedup graph.
  Each new user improves all three.

## 6. Milestones

- **M-S1 — Swarm transport behind the seams.** Feature `swarm` (iroh +
  iroh-blobs). `hub swarm serve` seeds store chunks (TryReference), prints
  tickets; `verified_chunk` gains an Iroh rung fed by explicit tickets;
  direct BlobTicket round-trip between two daemons, byte-identical.
- **M-S2 — Federated tracker.** Provider announce/lookup as kappa edges +
  tags with TTL and node-key signatures; daemon re-announce loop under
  `share = true`; a two-node + one-seeder drill finds the seeder from a
  node that never saw it directly.
- **M-S3 — Parallel chunk fetcher.** Work-stealing across the chunk list
  (later: within-chunk striping for 256 MiB chunks), per-provider failure
  budgets, progress + resume; acceptance: N-peer fetch ≥ max single-peer
  throughput and ≥ 80% of aggregate.
- **M-S4 — One-command UX.** `hologram hub get <repo>` and `hologram hub
  share <repo>`; `kappahub:<manifest-κ>` links; license/intent gating;
  docs.

## 7. Non-goals

No BitTorrent transport in v1 (Iroh covers the need; two swarms split the
mesh). No DHT content routing before the federation proves insufficient. No
browser seeding. No change to the `.holo` archive or kappa wire formats —
the swarm rides existing seams.
