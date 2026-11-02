# Preview performance

This optional E2E suite measures preview playback and canvas interactions. Slow measurements do not fail a performance threshold. The ordinary E2E suites, checkpoint, and closeout do not execute these measurements. The suite still reports setup failures, invalid measurements, and application failures.

## Commands

List the available tests without a build:

```sh
npm run qa:e2e:preview-performance -- --list
```

Run the complete video catalog:

```sh
npm run qa:e2e:preview-performance
```

Run one named test:

```sh
npm run qa:e2e:preview-performance -- --case 'full editor manual1080p30: two-blur-masks'
```

Use `--headed` for a visible browser. Linux requires a display for this option. The runner builds the E2E artifact before measurements. It uses one worker and disables retries, traces, and video capture. Do not run builds or other tests during measurements.

## Protocols and profiles

The default measurement protocol uses three repetitions. Each playback repetition has five seconds of warmup and thirty seconds of measurement. The qualification protocol uses one repetition, two seconds of warmup, and three seconds of measurement. Use qualification to check scenario setup. Do not use qualification results as a performance baseline.

Drag cases use sixty pointer movements, followed by a settlement interval. Playwright controls input delivery. Reports include the received input intervals.

```sh
SNIPTALE_PREVIEW_PERFORMANCE_PROTOCOL=qualification \
SNIPTALE_PREVIEW_PERFORMANCE_CASES=annotation-border,zoom-borders-keys-clicks \
SNIPTALE_PREVIEW_PERFORMANCE_EDITORS=gallery,native \
npm run qa:e2e:preview-performance
```

| Variable | Values | Default |
| --- | --- | --- |
| `SNIPTALE_PREVIEW_PERFORMANCE_PROTOCOL` | `measurement`, `qualification` | `measurement` |
| `SNIPTALE_PREVIEW_PERFORMANCE_CASES` | Catalog IDs separated by commas, or `all` | `all` through the runner |
| `SNIPTALE_PREVIEW_PERFORMANCE_EDITORS` | `gallery`, `native`, or both separated by a comma | Both through the runner |
| `SNIPTALE_PREVIEW_PERFORMANCE_SOURCE` | `720p30`, `720p60`, `1080p30`, `1080p60`, `2160p30`, `2160p60` | `1080p60` |
| `SNIPTALE_E2E_VIEWPORT` | Repository viewport preset, including `1280x560` | `1920x900` |
| `SNIPTALE_PREVIEW_PERFORMANCE_MODES` | `native`, `manual720p30`, `manual1080p30` | `manual1080p30` through the runner |

The Gallery mode `native` measures the source video layer. It does not measure complete overlay publication. The full editor uses live preview. Its raster follows the selected manual preset, with a thirty FPS limit.

The fixture generator requires FFmpeg, FFprobe, and DejaVu Sans Mono at the paths in the fixture owner. It generates actual encoded video. It checks dimensions, codec, duration, frame count, and timestamps with FFprobe. It records tool versions and content hashes. It never substitutes metadata for encoded 1080p media.

Source dimensions, composition dimensions, and preview backing dimensions are separate values. For example, a window header can increase composition height above the source height. A preview preset specifies raster size. The CSS viewport does not specify the raster size.

## Reports and comparisons

Each run stores its reports under `.tmp/preview-performance/runs/<run-id>/`. Each test stores raw samples and screenshots under that run's `results` directory. The run includes `summary.json` and a Playwright HTML report. `.tmp/preview-performance/summary.json` contains the latest summary. Previous run directories remain available.

The summary records the Git revision, dirty state, and build asset hash. Samples record the fixture, protocol, browser, CPU, GPU information, DPR, and viewport. Browser GPU information does not prove that video decoding uses hardware acceleration. Compare runs with the same fixture, protocol, preview settings, and infrastructure. Keep software rendering and desktop GPU rendering in separate comparisons.

Playback reports separate source video callbacks, completed composition publications, and RAF intervals. RAF means `requestAnimationFrame`. RAF intervals measure scheduling delays, not composition FPS. Publication FPS counts publications across the complete measurement window, including periods without publications.

Active publication FPS describes intervals between publications. A trailing publication gap can explain differences between these metrics. Neither metric measures physical display scanout.

Drag reports separate DOM geometry acknowledgement from canvas publication acknowledgement. These times describe the next observed update after the latest input. A publication can contain an earlier input. These times do not establish causal attribution or physical display latency.

A visible decoded fixture must exist before drag timing. Geometry movement alone does not prove that the canvas updated. Invalid samples do not enter aggregate comparisons. A valid preview can produce a zero FPS result. Preview failures invalidate the measurement.

## Add a case or an editor

The video catalog lives in `tooling/test/e2e/support/preview-performance-scenarios.ts`. Add a stable ID and the required scenario settings there. Both video editors consume the same authored scene. Use the smallest scenario that retains a found workload. Add combinations when isolated cases do not reproduce that workload.

For another canvas editor, add a spec with the name `preview-performance-<editor>.spec.ts` beside the existing spec. The optional configuration discovers that prefix. Ordinary Playwright discovery excludes that prefix. Use the editor's normal setup and interaction commands. Reuse the environment collector, percentile calculation, and report attachment format.

Attach each result as `preview-performance-sample` with JSON content. Include `valid`, editor identity, operation, and applicable measurements. Image editor cases can report interaction latency without video playback or a fabricated FPS value. Keep editor preparation outside timing. Remove observers and callbacks after each sample.
