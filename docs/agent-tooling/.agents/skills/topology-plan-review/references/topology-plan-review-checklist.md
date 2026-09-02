# Topology Plan Review Checklist

## Severity

- `P1`: wrong root/major-area ownership, crossed runtime boundary, incomplete manifest capable of partial moves, or replacement landing zone that forces rework.
- `P2`: same-name collision, broad role bucket, repeated-prefix scatter, stale consumer/map/mock/proof path, unsafe rewrite, or wrapper mismatch likely to create false confidence or predictable failure.
- `P3`: bounded owner-local cleanup that does not block the selected move.

## Target Shape

- The current code-organization contract and supplied bounded manifest define target paths. Historical paths are evidence, not authority.
- Major areas describe product/runtime/platform ownership. Owned seams describe currently independently changing flows, contracts, state authorities, UI surfaces, or effect boundaries. Each proposed owner has an explicit current change reason. Known accepted adjacent changes may reject an immediately brittle placement, but hypothetical future changes do not justify current owners or abstractions. Roles such as `view`, `controller`, `state`, `hooks`, `types`, `utils`, and `actions` belong inside an owned seam unless the role itself is the documented stable owner.
- The planning unit is an owner/change-reason cluster. Classify the candidate as `Split`, `Consolidate`, or `Keep`; raw line reduction, file growth, or minimum file count is never the objective. Minimize navigation transitions while retaining explicit runtime, owner, adapter, and public-contract boundaries.
- Manual topology evidence may contain a disjoint path-owner partition plus explicitly overlapping forwarding-edge operation candidates. Require the complete compact edge inventory rather than a sampled rich cluster list. A forwarding-only module with exactly one production consumer requires a stable non-forwarding `Consolidate` target or explicit public-contract, runtime, cross-owner, unresolved-topology, or independent-change-reason `Keep` proof.
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
- file mode and content digest for every affected file
- authoritative runtime modes and generated-input digests where relevant, negative proof, user-visible proof, rollback groups, and target collision checks
- exact high-risk proof ownership, including moved tests and production targets

Validate all source paths, target parents, file/directory collisions, duplicate targets, case collisions, and composed mappings before the first rename. Missing or ambiguous entries block planning approval.

## Move Mechanics

- Apply the validated manifest as one coherent batch. Do not broaden the move into unrelated normalization.
- Rewrite imports with a bounded resolver that maps both moved importers and moved targets before recomputing relative paths. File-level mappings win over broader directory mappings.
- Treat rename-only, import-only, and top-level mock-ID-only changes as mechanical only when old and new bodies prove that classification; body/assertion/factory changes remain behavioral.
- Update mocks, type-query strings, source-reading paths, facade tests, registries, build/static-asset owners, owner maps, focused-proof targets, and policy data in the same batch.
- Production and proof paths must resolve after the move. A surviving test is insufficient when its mapped production owner is missing or empty.
- Do not create replacement barrels, hidden runtime backedges, broad compatibility surfaces, new public types, or neighboring helper files that preserve one broad owner merely to simplify the move or satisfy a structural metric.
- Before and after the move, record file/navigation transitions, facade/proxy/pass-through layers, public contract size, state authorities, effects/recovery placement, cohesion, and independent change reasons. Consolidation needs corroborated fragmentation families, one shared owner/change reason, and a proven existing merge target.
- Follow forwarding ladders through single production consumers to the first stable non-forwarding merge target. Do not treat a forwarding consumer as the final landing zone or let fixed path depth hide the operation edge.
- Negative architecture proof covers cycles, dual state authority, cross-owner imports, broad facade/state/props bags, forwarding-only layers, dead exports, generic helpers, and UI mixed with privileged, persistence, or transport effects. Preserve ordering and the reachable failure, rollback, and cleanup behavior already required by acceptance or material invariants; do not add behavior to complete a theoretical matrix.
- Do not manually stage. Closeout owns staging after proof.

## Planning Bundle And Cheap Negative Proof

Before implementation, provide the current topology inventory, target map, complete manifest summary, facade/fold decisions, dependent fallout, mechanical/behavioral classification, risk-specific proof map, rollback groups, and grouped cheap probes.

Cheap post-move probes should cover stale old paths, malformed imports, missing targets, same-name/case collisions, unexpected nesting, owner-map and focused-proof resolution, mock/source-reading paths, and public-facade drift. They complement rather than replace `qa:checkpoint`.

When harness/shared-control targets change, the main implementation thread runs `qa:release-harness` before `qa:checkpoint`. Candidate review begins only after both applicable harness proof and checkpoint are green. The reviewer does not run wrappers.

## Review Decisions

Request changes when the bundle is incomplete, the target is not a stable owner shape for current accepted behavior, proposed owners lack current independent change reasons, the result is a distributed god-object, the move crosses a runtime/authority boundary without an adapter/contract, rewrite mechanics are unbounded, collision/facade decisions are unresolved, dependent maps remain stale, or supplied proof does not attach to the moved owners. Omit hypothetical extensibility unless the user explicitly requested a future-topology inventory.

Approve with comments only for evidenced residual debt that materially constrains the verdict or belongs to an explicitly requested broader inventory. Do not turn the review into a new root plan or require another review after mechanical cleanup unless the relevant owner, behavior, public contract, or security seam changed.
