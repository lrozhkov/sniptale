# Topology Plan Review Checklist

## Severity

- `P1`: wrong root/major-area ownership, crossed runtime boundary, incomplete manifest capable of partial moves, or replacement landing zone that forces rework.
- `P2`: same-name collision, broad role bucket, repeated-prefix scatter, stale consumer/map/mock/proof path, unsafe rewrite, or wrapper mismatch likely to create false confidence or predictable failure.
- `P3`: bounded owner-local cleanup that does not block the selected move.

## Target Shape

- The current code-organization contract and supplied bounded manifest define target paths. Historical paths are evidence, not authority.
- Major areas describe product/runtime/platform ownership. Owned seams describe independently changing flows, contracts, state authorities, UI surfaces, or effect boundaries. Roles such as `view`, `controller`, `state`, `hooks`, `types`, `utils`, and `actions` belong inside an owned seam unless the role itself is the documented stable owner.
- Root entrypoints and compatibility facades stay thin and frozen. Same-name file/folder pairs require an explicit fold, index, deletion, or compatibility decision.
- Shared residency is proven per layer. Runtime adapters, UI, effects, persistence, and authority do not become shared merely because a broad family contains reusable primitives.

## Complete Bounded Manifest

The manifest is an open-set inventory over the selected root/seam, not a hand-picked file list. It must record:

- every source path and target path, including composed moves and collision folds
- importer and public-contract consumers, including relative and alias imports
- owner/runtime boundary and intended dependency direction
- facade/index/leaf-bridge decisions and compatibility consumers
- mocks, type-query module IDs, source-reading tests, fixtures, and path-bearing product registries
- docs, build inputs, owner maps, policy/allowlists, quality classification, focused-coverage maps, and validation consumers
- authoritative modes, digests/generated inputs where relevant, negative proof, user-visible proof, rollback groups, and target collision checks
- exact high-risk proof ownership, including moved tests and production targets

Validate all source paths, target parents, file/directory collisions, duplicate targets, case collisions, and composed mappings before the first rename. Missing or ambiguous entries block planning approval.

## Move Mechanics

- Apply the validated manifest as one coherent batch. Do not broaden the move into unrelated normalization.
- Rewrite imports with a bounded resolver that maps both moved importers and moved targets before recomputing relative paths. File-level mappings win over broader directory mappings.
- Treat rename-only, import-only, and top-level mock-ID-only changes as mechanical only when old and new bodies prove that classification; body/assertion/factory changes remain behavioral.
- Update mocks, type-query strings, source-reading paths, facade tests, registries, build/static-asset owners, owner maps, focused-proof targets, and policy data in the same batch.
- Production and proof paths must resolve after the move. A surviving test is insufficient when its mapped production owner is missing or empty.
- Do not create replacement barrels, hidden runtime backedges, broad compatibility surfaces, or new public types merely to simplify the move.
- Do not manually stage. Closeout owns staging after proof.

## Planning Bundle And Cheap Negative Proof

Before implementation, provide the current topology inventory, target map, complete manifest summary, facade/fold decisions, dependent fallout, mechanical/behavioral classification, risk-specific proof map, rollback groups, and grouped cheap probes.

Cheap post-move probes should cover stale old paths, malformed imports, missing targets, same-name/case collisions, unexpected nesting, owner-map and focused-proof resolution, mock/source-reading paths, and public-facade drift. They complement rather than replace `qa:checkpoint`.

When harness/shared-control targets change, the main implementation thread runs `qa:release-harness` before `qa:checkpoint`. Candidate review begins only after both applicable harness proof and checkpoint are green. The reviewer does not run wrappers.

## Review Decisions

Request changes when the bundle is incomplete, the target is not a stable owner shape, the move crosses a runtime/authority boundary without an adapter/contract, rewrite mechanics are unbounded, collision/facade decisions are unresolved, dependent maps remain stale, or supplied proof does not attach to the moved owners.

Approve with comments only for explicit non-blocking residual debt outside the bounded candidate. Do not turn the review into a new root plan or require another review after mechanical cleanup unless the relevant owner, behavior, public contract, or security seam changed.
