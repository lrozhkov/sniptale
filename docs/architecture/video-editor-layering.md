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

## Gallery and Native ownership

These editors share domain rules and rendering owners. They retain separate temporal adapters and mutation authorities.

Paths in the following table are relative to `apps/extension/src/`.

| Behavior | Shared owner | Gallery adapter | Native adapter |
| --- | --- | --- | --- |
| Text documents and accepted snapshots | `features/video/review/text-document.ts`, `text-validation.ts`, `speech-validation.ts` | `gallery/video-review/use-review-text.ts` and the review history writer | `features/video/project/text/` and `video-editor/runtime/session/text-voice.ts` |
| Recognition, rewrite, and voice requests | `workflows/audio-jobs/`, `workflows/video-review/speech-audio.ts`, `recognition-text.ts`, `text-rewrite-client.ts` | `workflows/video-review/recognition.ts`, `text-rewrite.ts`, `text-voice.ts`, `speech-publication.ts` | `workflows/video/project-recognition.ts`, `project-text-rewrite.ts`, `project-text-voice.ts`, `project-voice-take.ts` |
| Scene, motion, and spatial rendering | `features/video/composition/` and `features/video/project/scene/` | `features/video/review/advanced/` and review timeline projection | Project scene fields and the composition timeline |
| EffectV1 documents, resources, and execution | `features/video/project/effect-bundle/`, `effect-instance/`, `features/video/composition/effect-runtime/` | `features/video/review/annotation-effects/` | Project EFFECT clips, effect instances, and transition targets |
| Portable resource restoration | `workflows/media-hub-backup/v6/` and `composition/persistence/` | Review workspace roots | Video project roots and project resources |
| Tags and saved views | `features/media-hub/`, `workflows/media-hub/`, `composition/persistence/media-library/` | Gallery library selection | Native material selection |

Text edits change the current document. An accepted take retains its captured text, timing, and resource identity. Material names do not identify resources.

The Gallery timeline maps source intervals through cuts and speed changes. Native project operations retain separate clips, tracks, logical lanes, source instances, and overlap policies. `features/video/project/source-voiceover-playback.ts` supplies the Native source-take playback plan. Preview and offline audio consume that same plan.

Effect catalog entries supply verified documents and resources when the user applies an effect. The accepted project retains snapshots and resource references. Catalog replacement must not rewrite accepted project instances. Theme and style classify effects. Media tags remain library metadata. Grouping and linking remain montage relationships.

### Transfer and publication

`features/video/review/project-conversion.ts` plans conversion into existing Native project fields. Its presentation, annotation, motion, camera, cursor, audio, and document planners preserve their respective domain rules.

`video-editor/project/operations/workspace.ts` captures the Gallery workspace and prepares its resources. The existing project persistence transaction checks that captured source before it publishes the destination. The conversion planner does not acquire write authority.

Conversion creates a separate editable project. It does not flatten the Gallery result or make the catalog a runtime dependency. Missing resources, changed source data, and unsupported authored values produce explicit refusal before destination publication. Retry captures the source again.

Deleting a Gallery project differs from purging its recording. Retained Native resources follow the existing persistence reference and deletion policies. Passive legacy fields do not enable retired overlays or speech behavior.

### UI and future changes

Both inspectors consume `@sniptale/ui/categorized-inspector`. Native shell surfaces also consume `@sniptale/ui/inspector-shell`. `ui/compact-inspector-controls/` supplies the shared parameter controls. Editor adapters select applicable sections and keep their own selection and draft state.

Change a shared domain owner when both editors need the same rule. Keep temporal projection, placement, mutation, and save behavior in the applicable adapter. An editor-specific feature does not require a placeholder implementation in the other editor. Add a shared contract only when an actual second consumer needs it.

The mounted editor retains mutation, history, and save authority during asynchronous proposals. Background admission and offscreen rendering retain their existing message and resource boundaries. A proposal or staged preview is not accepted project data.

### Proof discovery

`tooling/qa/proof/focused-coverage/maps/local.mjs` supplies the existing focused consumer map. Transitive affected-test discovery remains applicable where that map does not cover the changed behavior.

The `native-workspace-review-transfer` entry includes workspace, transfer, and stale-save publication tests. The `source-voiceover-playback-consumers` entry includes playback planning, split behavior, and offline audio consumers. Update these existing entries when a supported consumer changes. Checkpoint must select and execute the required tests.

Browser acceptance must exercise the actual editor operation. A prepared bitmap proves projection only. Owner tests prove controlled admission and concurrency. Real resource transfer and encoding require their own connected proof. Production MV3 dispatch requires a separate runtime witness when host harness tests bypass that boundary.
