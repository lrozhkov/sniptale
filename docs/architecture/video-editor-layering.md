# Video editor layering

Video-editor imports follow this order:

```text
project + contracts
        ↑
interaction + state + runtime
        ↑
preview + timeline + library + export + chrome
        ↑
workspace
        ↑
shell
```

An owner may import a peer in its row only while the owner graph remains acyclic. An owner may import a lower row. A lower row must not import a higher row. `project` owns serializable project policy. `state` owns serializable editor state. `runtime` adapts those contracts to sessions and effects. `workspace` composes product surfaces. `shell` composes the page.

Keep `contracts` independent of React, Zustand, browser APIs, and product surfaces. Put reusable editor chrome in `chrome`. Put neutral formatting in `contracts`. The existing `application`, `persistence`, `recording`, and `diagnostics` seams have no invented row order, but they remain subject to the [general dependency rule](code-organization.md#dependency-direction). Do not add a reverse edge against an established owner dependency or a cycle through those seams.

Keep project history in memory with a maximum of 100 actions. Reset it after accepted project replacement. Commit one activated timeline pointer gesture as one history transaction. Keep `runtime/controller/store.ts` as the only adapter from full Zustand state to the controller port.

## Recording telemetry

Controlled-tab and native capture produce `RecordingTelemetryEntry` values and commit them through `saveRecordingTelemetrySafely`. Static-frame analysis may update the same sidecar. The `recording_telemetry` IndexedDB store is the only durable authority. Parse entries before writes, after reads, and during backup restore.

Load telemetry by `project.baseRecordingId`. Reject mismatched or late results. Normalize project coordinates in `video-editor/project/operations/telemetry.ts`.

Permit auto-processing only when the project still contains source-timed clips for the recording and telemetry contains an action, cursor sample, or overlapping idle or static range. Use the same predicate for UI availability and mutation admission.

Treat missing, malformed, metadata-only, and stale telemetry as unavailable. Do not synthesize fallback telemetry. Delete and export telemetry through the recording and media-hub lifecycle owners.
