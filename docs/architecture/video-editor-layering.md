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

An owner may import a peer in its row only while the owner graph remains acyclic. An owner may import a lower row. A lower row must not import a higher row.

`project` owns serializable project policy. `state` owns serializable editor state. `runtime` adapts those contracts to sessions and effects. `workspace` composes product surfaces. `shell` composes the page.

Keep `contracts` independent of React, Zustand, browser APIs, and product surfaces. Put reusable editor chrome in `chrome`. Put neutral formatting in `contracts`. The existing `application`, `persistence`, `recording`, and `diagnostics` seams have no invented row order, but they remain subject to the [general dependency rule](code-organization.md#dependency-direction). Do not add a reverse edge against an established owner dependency or a cycle through those seams.

Keep project history in memory with a maximum of 100 actions. Reset it after accepted project replacement. Commit one activated timeline pointer gesture as one history transaction. Keep `runtime/controller/store.ts` as the only adapter from full Zustand state to the controller port.

## Recording telemetry

Controlled-tab and native capture produce `RecordingTelemetryEntry` values and commit them through `saveRecordingTelemetrySafely`. The `recording_telemetry` IndexedDB store is the only durable authority. Parse entries before writes, after reads, and during backup restore.

Load telemetry for the distinct recording origins in project materials and `project.baseRecordingId`. Keep the loaded collection disposable.  `recording_telemetry` remains the sole durable captured-sidecar authority. Reject mismatched, foreign, or late results when the project or its source set changes. One unavailable source must not discard other available sources.

Refresh on matching media-hub sidecar updates, not on timeline playback or timing edits. Normalize project coordinates in `video-editor/project/operations/telemetry.ts`. Project history projection enumerates concrete source clip instances and namespaces marker identity by source and instance.

Permit auto-processing only if the project still contains source-timed clips for the recording. Also require telemetry with an action, cursor sample, or an observed idle or typing range. Use the same predicate for UI availability and mutation admission.

Treat missing, malformed, metadata-only, and stale telemetry as unavailable. Do not synthesize fallback telemetry. Delete telemetry through the recording and media-hub lifecycle owners. Export telemetry through those same owners.

## Export lifecycle

The background runtime commits matching offscreen progress and terminal events to the project-export ledger before it forwards them to the editor owner. Serialize these transitions with export start/cancel admission. Ignore superseded jobs and late progress after terminal state.

The offscreen document supplies rendering events through runtime messages. It cannot write Chrome session storage. A completed editor notification must therefore never be the only evidence of completion while the admission ledger remains running.

## Quick-review source crop

The advanced canvas owner stores an optional normalized source rectangle. The scene owner derives its aspect from the selected canvas and preserves its center within source bounds. Resolution changes with the same aspect retain the rectangle. The derived rectangle contains at least one source pixel where the aspect permits this.

`videoRect` and `videoTransform` retain original source coordinates. They can extend beyond the visible cropped window. `visibleVideoRect` describes the cropped video before camera motion. `windowRect` includes that rectangle and the window header. The original decorated window remains the coordinate basis for authored focus objects and manual camera targets.

The existing scene renderer clips source pixels before camera, perspective, blur, and magnification passes. Content objects use the source projection and crop boundary. Viewport objects and separate webcam frames retain their existing geometry. Camera planning clips disposable observations at crop entry and exit. It preserves separate visible visits and never changes stored events or paths.

The crop editor keeps a local draft and commits once on Apply. Cancel and Escape discard that draft. The editor uses the existing frame decoder at the time selected when the editor opens. Crop changes use the existing workspace queue and history.
