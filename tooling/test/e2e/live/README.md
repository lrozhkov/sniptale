# Live AI integration E2E

This manual suite uses the actual extension UI and a selected provider account. Inference can incur provider charges. Ordinary CI and ordinary Playwright discovery exclude this directory. Local error tests need no account or key.

## Preparation

Install the repository dependencies and Playwright browser through the existing repository instructions. Build the test extension once for the current source:

```sh
npm run qa:e2e:build
```

Set `SNIPTALE_EXTENSION_BUILD_DIR=.tmp/e2e-builds/test` for the following commands. Use `PLAYWRIGHT_BROWSERS_PATH` if the browser installation uses a different directory. The default viewport is 1920×900. Set `SNIPTALE_E2E_VIEWPORT=1280x560` for the short primary viewport. Each scenario uses its own temporary browser profile. Tests remove their registered connections through Settings.

## Explicit provider selection

Select one provider for each invocation. Workers receive the same validated profile snapshot, even if the external file changes. The suite never substitutes another provider or retries paid inference. A failed selected operation fails visibly. Operations absent from a profile appear as explicit skipped tests.

Pass exactly one credential source: `SNIPTALE_LIVE_API_KEY` or `SNIPTALE_LIVE_KEY_FILE`. The file contains only the key, with optional surrounding whitespace. It is not a dotenv file. Keep the file outside the repository. Do not put the key in a command argument, configuration JSON, or committed file.

```sh
SNIPTALE_EXTENSION_BUILD_DIR=.tmp/e2e-builds/test \
SNIPTALE_LIVE_KEY_FILE=/absolute/external/neuraldeep.key \
npm run qa:e2e:live -- --profile neuraldeep
```

The NeuralDeep profile selects text, recognition, and speech models explicitly. Provider availability and account permissions can change. Its `whisper-1` model previously returned rate-limit errors. A declared operation is a test target, not an availability guarantee.

RouterAI is a separate explicit run:

```sh
SNIPTALE_EXTENSION_BUILD_DIR=.tmp/e2e-builds/test \
SNIPTALE_LIVE_KEY_FILE=/absolute/external/routerai.key \
npm run qa:e2e:live -- --profile routerai
```

The RouterAI profile declares recognition through audio-chat with JSON Object. It does not declare text generation or speech generation. During task verification, prefer NeuralDeep. Use RouterAI only after NeuralDeep unavailability or a service limit, and retain both results. `profiles.ts` owns the small built-in profiles. Shared scenario code has no provider-specific branches.

For another compatible account, copy `config.example.json` outside the repository. Replace its endpoint and exact Model IDs. Remove operations that the account does not support. Set audio parameters and voice identifiers explicitly. The example contains placeholders and cannot establish a usable account connection.

```sh
SNIPTALE_EXTENSION_BUILD_DIR=.tmp/e2e-builds/test \
SNIPTALE_LIVE_KEY_FILE=/absolute/external/provider.key \
npm run qa:e2e:live -- --config /absolute/external/provider.json
```

Use `--grep 'Scenario text'` to select a scenario. This filter does not change the selected provider. Use `--list` to inspect profile-specific tests without credentials or browser launch. Profile parsing occurs before browser launch. Unknown fields, secret-bearing URLs, invalid operation parameters, and ambiguous key sources fail with fixed messages.

## Scenarios and results

- Scenario text: choose a model, receive a proposal, Apply, autosave, reload, and restore the contextual choice.
- Gallery speech: play the preview, Apply, reload the accepted audio, and preserve playback after provider disable.
- Gallery recognition: recognize original and imported voiceover sources, Apply, reload, and preserve content and media.
- Montage recognition: recognize the selected audible source, Apply, reopen the exact saved project, and preserve playback and drafts.

The selected profile and declared operations appear in the terminal. Results distinguish passed, failed, and skipped scenarios. A provider success proves only the tested operation, model, endpoint, account, and time. Catalog access does not prove generation access. Traces, video, and automatic screenshots are disabled. Tests clear credential fields before cleanup and do not export storage or provider payloads. The suite uses synthetic source content. Results remain under `.tmp/live-e2e/` and must not contain secrets.

## Deterministic local errors

```sh
SNIPTALE_EXTENSION_BUILD_DIR=.tmp/e2e-builds/test \
npm run qa:e2e:live -- --local-errors
```

This mode removes live credential variables from the child process. It selects only the local error spec. The local endpoint supplies authorization, permission, unavailable-model, quota, rate-limit, and service failures. Tests preserve authored source and reopen the exact project. These tests do not depend on vendor error behavior.

## Committed spoken fixtures

The fixtures contain synthetic Russian speech created for this integration task. They contain no user recording or credential. The source text was: “Проверка распознавания речи в редакторе Sniptale. Этот текст создан специально для теста.” The task generated the source once with NeuralDeep `qwen3-tts`, voice `vivian`, on 2026-10-27. A one-time local conversion produced the WebM video and WAV upload. Test execution reads these committed bytes directly. No runtime fixture generation, ffmpeg installation, or extra provider request is necessary.

| File | MIME | Duration | SHA-256 |
| --- | --- | --- | --- |
| `fixtures/speaking-source.webm` | `video/webm` | 12.008 seconds | `c532c7e850ba70cb994c10638566a61d433f1cdd419db6f58e358bb323186b03` |
| `fixtures/speaking-upload.wav` | `audio/wav` | 12 seconds | `81badddd5b0dfb0c488c26c3dab25d7a44781a8d9aeb9ae390b02fac28aa4cc7` |

The ordinary tracked media fixture supports local failure tests. Recognition tests use the spoken fixtures above.
