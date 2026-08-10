# Video editor layering

The video editor keeps page-local dependencies in this direction:

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

An owner may import another owner on the same row or a lower row. A lower owner must not import a higher row. `project` owns serializable project policy, `state` owns serializable editor state, and `runtime` adapts those contracts to sessions and effects. Product surfaces consume those lower owners, `workspace` composes the surfaces, and `shell` remains the page composition root.

The page-local `contracts` owner stays independent of React, Zustand, browser APIs, and product surfaces. Reusable video-editor chrome belongs to `chrome`, not `shell`; neutral formatting belongs to `contracts`, not a product surface.

`application`, `persistence`, `recording`, and `diagnostics` retain their existing explicit seams and are not part of this row-order rule.

## Recording telemetry authority

Controlled-tab capture and native capture are telemetry producers, not storage authorities. Each producer converts its runtime snapshot into `RecordingTelemetryEntry` and commits it through `saveRecordingTelemetrySafely`. Static-frame analysis may enrich that same recording sidecar. The guarded `recording_telemetry` IndexedDB store is the only durable authority; its entry parser validates identity, timestamps, nested snapshot shape, and temporal ranges before writes and after reads. Backup restore passes imported telemetry through the same parser before it reaches the store.

The video editor loads telemetry by `project.baseRecordingId`, rejects mismatched or late results, and reloads when the matching recording sidecar changes. Project-space normalization remains in `video-editor/project/operations/telemetry.ts`; capture adapters do not own editor coordinates. The timeline may display a matching sidecar, but auto-processing is eligible only when the project still has source-timed clips for that recording and the sidecar contains an action event, a cursor sample, or an overlapping idle/static stable range. The same eligibility predicate gates the toolbar action and the mutation operation.

Telemetry remains optional. Missing, malformed, metadata-only, or stale sidecars produce no auto-processing action and never create fallback telemetry. This path does not add retention: telemetry is deleted and exported under the existing recording and media-hub lifecycle policies.
