# Sniptale

**Snip the web. Tell the story.**

Sniptale is a local-first Chromium (MV3 Extension) workspace for capturing, understanding, annotating, recording, editing, and exporting the web — built as an AI-first software-engineering experiment.

> **Alpha preview.** The broad product surface and repository architecture are largely in place, but individual workflows still need product-level validation, polish, compatibility work, performance tuning, and real-world testing. Project, archive, preset, and effect formats may change without migration or backward compatibility. Do not rely on the current build as the only copy of important data.

Sniptale is not intended to be only a screenshot tool or only a screen recorder. It is an attempt to cover the wider workflow around collecting information from web pages and turning it into something useful:

```text
live page
  → prepare, edit, redact, or annotate
  → capture screenshots, video, diagnostics, or structured data
  → refine the result in an editor, guide, presentation, or video project
  → export it or keep it in a local media library
```

The core application works locally in the browser. It does not require a Sniptale account, subscription, or hosted Sniptale backend. External AI and optional network-assisted snapshot features are opt-in and are described in [Local-first does not mean zero network](#local-first-does-not-mean-zero-network).

## Build from source

### Requirements

- Node.js `>=22.12 <23`
- npm
- Chrome 140 or newer

Install the exact dependency versions from `package-lock.json` and create a release-mode Vite build:

```bash
npm ci
npm run build:release
```

`npm ci` is the dependency-install command; there is no separate `npm run ci` script. The second command runs only the Vite build. Release mode removes console and debugger logging, omits source maps, and writes the unpacked extension to `dist/`.

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the generated `dist/` directory.

This build can run natively on Windows. Linux, or WSL with the repository and `node_modules` stored inside the WSL Linux filesystem rather than under `/mnt/c`, is required only for the repository's supported full development and QA workflow. See [WSL setup](docs/tooling/wsl-setup.md), the [Release guide](docs/oss/release.md), and the [Operator handbook](docs/tooling/operator-handbook.md) for those workflows and all other commands.

## Why this project exists

Sniptale began as my first pet project for testing a practical question: **can a person who is not a software developer build and continue maintaining a complex application through coding agents?**

I do not have the skills to write this codebase by hand. My role has been to define the product direction, explain desired behavior, set acceptance criteria, inspect results, make architecture and security trade-offs, and decide what is ready to keep or release. The implementation itself has been produced through AI coding-agent sessions.

I started by trying different extensions, agents, workflows, and models. Over time I settled on Codex because it became the most effective fit for this repository and the way I work. Most of the current application code, tests, refactors, documentation, and quality tooling were written or revised through Codex-driven sessions.

The project was not built as one long generation prompt. Development repeatedly followed a constrained review loop:

```text
product intent and acceptance criteria
  → bounded implementation task
  → deterministic checks and tests
  → separate architecture or security review context when risk justified it
  → consolidated refactor
  → repeat
```

At larger milestones, the repository was reviewed again as a whole to look for structural drift, unsafe boundaries, duplicated ownership, untested failure paths, and divergence from the intended architecture. These reviews are internal AI-assisted engineering controls, not a third-party certification, professional penetration test, or guarantee that the application is defect-free.

The experiment has already shown that coding agents can implement substantial vertical features. It has also shown that generating code is not the hardest part. The harder problem is keeping a growing system coherent, testable, secure, and reversible. Much of the repository therefore exists to make architectural rules executable rather than leaving them as informal advice.

## Current maturity

The architecture and approximate target feature set have largely stabilized. The next phase is not to add every possible feature; it is to take each existing workflow through product-level validation, simplify rough interactions, harden recovery paths, test real sites and long-running media workloads, and decide which experimental ideas deserve a stable contract.

| Area                                                                                  | Current status                                                                                              |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Repository architecture and quality guardrails                                        | Established and actively enforced, but still open to simplification when a boundary does not pay for itself |
| Screenshot capture, page preparation, structured export, Media Hub, and image editing | Alpha                                                                                                       |
| Browser recording and video editing                                                   | Alpha; advanced automation, codec paths, and effect workflows remain experimental                           |
| Scenario, step-guide, and presentation authoring                                      | Experimental                                                                                                |
| Saved web snapshots and diagnostic capture                                            | Experimental                                                                                                |
| Native desktop companion                                                              | Separate project and experimental integration surface                                                       |
| Backward compatibility and migrations                                                 | Not promised during the alpha-preview phase                                                                 |
| Cloud sync, hosted collaboration, and team sharing                                    | Not implemented; the design and privacy trade-offs remain undecided                                         |

The current source contains no account gate, paid tier, or artificial recording quota. Practical limits still exist: browser APIs, operating-system capture behavior, codec availability, available memory, local disk space, page complexity, and unfinished implementation paths can all limit a workflow.

## What Sniptale can do

### Capture and prepare a page

Sniptale supports visible-area, full-page, and selected-region screenshots. Capture can start from the popup, browser context menu, in-page preparation toolbar, keyboard shortcut, or a configurable quick action.

Quick actions can combine a capture mode with a viewport preset, delay, output format, quality, destination, and post-capture action. Bundled examples include opening a visible capture in the editor, downloading a full-page capture, copying a region to the clipboard, and taking a delayed screenshot. Outputs can be copied, downloaded, sent through a save preset, opened in the image editor, recorded as a scenario step, or retained in the local Gallery.

Before capture, an in-page preparation mode can be used to make the source page presentation-ready. It includes:

- direct text editing and element-level style inspection;
- typography, spacing, sizing, background, border, shadow, gradient, image, and object-fit adjustments;
- reusable page-style templates;
- navigation locking while editing;
- viewport presets and capture countdowns;
- an optional pinned toolbar that can restore its working state after a page refresh.

### Annotate using the page structure

A central Sniptale idea is that annotation should understand the page instead of forcing every mark to be drawn manually.

The element-aware highlighter can attach frames to real DOM elements, preserving page geometry while the capture is prepared. Frames can use configurable borders, fill, padding, corner radius, shadow, blur, focus effects, comments, callouts, and automatically numbered step badges. This makes it possible to create a clean annotated page screenshot in a few clicks rather than manually aligning every rectangle.

Auto-Blur can scan visible text for selected categories of potentially sensitive information, including email addresses, phone numbers, URLs or logins, IP addresses, payment-card-like values, and document-number-like values. The user chooses which findings to apply; detection is a convenience feature, not a guarantee that all sensitive data will be found.

### Edit page content with AI

The page-preparation surface can optionally send a bounded, structured representation of selected editable page data to an AI provider. The user can preview the exact JSON payload, choose which fields or table rows are editable, apply a prompt template, validate the returned operations against a schema, and review the result before applying it back to the page.

Sniptale can use Chrome's built-in on-device Prompt API where available or a user-configured OpenAI-compatible endpoint. External-provider use is optional and requires explicit disclosure of the provider, model, prompt inclusion, and data classes being sent.

### Configure repeatable workspace actions

Several product surfaces include a command palette for navigating or running common actions without searching through every panel. The browser context menu can also be configured around screenshot preparation and capture, recording, export, editors, the Gallery, settings, quick actions, and copying the current page link as rich text, Markdown, or plain text.

The interface supports Russian and English, plus system, light, and dark appearance modes. Viewport presets, download-folder presets, capture defaults, quick-action hotkeys, page-style rules, and editor presets are intended to turn repeated documentation or QA routines into a small number of predictable actions.

### Keep captures in a local Media Hub

Screenshots, recordings, audio, exports, video projects, scenario projects and exports, and saved web snapshots can be retained in a local IndexedDB-backed media library.

The Gallery includes search, sorting, tags, multiple view densities, previews, rename and download actions, image copy, multi-selection, batch tag updates, ZIP download, and links into the relevant editor or viewer. A storage manager can identify old, large, and orphaned items and estimate reclaimable space.

Backup and restore workflows can export the full Gallery or a selection to a ZIP archive. Depending on the chosen options, a backup can include source metadata, recording telemetry, editor drafts, web snapshots, and diagnostic support data. Import validates the archive, reports version and conflicts, and supports replace, skip, or duplicate strategies. Backups may contain sensitive URLs or diagnostic context; the export UI is expected to be treated as a data-disclosure boundary.

Privacy controls can delete retained product data while preserving selected UI preferences and AI configuration, or perform a broader factory reset that removes local data, preferences, and stored provider secrets.

### Extract structured information from web pages

Sniptale can parse a page into an internal structured document and project it into several export forms. A user can quickly copy the current page as cleaned JSON or Markdown, or run a batch export across selected open tabs.

Exportable data classes include structured page data, cleaned text and tables, attachments, images and previews, basic diagnostics, detailed sanitized diagnostics such as DOM, HAR, and console information, page styling and element diagnostics, and a full-page screenshot. Selected outputs can be combined into a ZIP archive, with progress, cancellation, per-tab failures, and retry support.

This is intended for documentation, research, support, QA, handoff, and AI-ready data extraction. The parser and projectors are still evolving, so output schemas are not yet stable public contracts.

### Save a local, read-only web snapshot

The experimental web-snapshot workflow can save a local package containing a screenshot, sanitized markup and styles, source metadata, warnings, and safe diagnostics. Saved snapshots appear in the Gallery and open in a dedicated read-only viewer.

Scripts, event handlers, cookies, authentication state, browser storage, page IndexedDB, API bodies, and live JavaScript state are excluded. Additional asset capture is not performed by default. Authenticated same-origin assets or anonymous external public assets can be enabled through explicit disclosure and acknowledgement, with security and fidelity limitations.

A snapshot is therefore a sanitized local reference, not a fully faithful virtual browser session and not a substitute for a standards-compliant archival crawler.

### Edit screenshots and other images

The image editor is a Fabric-based canvas workspace for lightweight design and annotation work. It supports paste, drop, file import, layers, hide and lock states, reorder, rename, duplicate and merge operations, undo and redo, crop, image and canvas resize, grouping, grid and magnetic snapping, and reusable tool presets.

Drawing and annotation tools include text, freehand drawing, lines, arrows, connectors, step labels, blur, common shapes, flowchart elements, callouts, stars, banners, buttons, technical symbols, and RoughJS-style elements. Imported SVG, JSON, and Excalidraw content passes through validation and sanitization before entering the document.

The scene can use a solid, gradient, or image background with configurable padding and presentation presets. Browser-window frames and technical metadata overlays can be generated around a screenshot. Raster effects cover common color, blur, noise, pixelation, sharpening, edge, vintage, and transform operations without trying to replace a full professional image suite.

Editor documents can be exported as images or retained as editable session data. Portability and team reuse of presets are part of the direction, but hosted preset sharing is not implemented.

### Build step guides and presentations

The experimental scenario editor records a process as a sequence of screenshots rather than only as a video. A capture can retain page URL, title, viewport, scroll position, selected-element identity and bounds, cursor or interaction metadata, and other bounded context needed for later editing.

A scenario can contain screenshot steps, sections, notes, dividers, focus and click overlays, cursor markers, arrows, rectangles, ellipses, text, and blur regions. Steps can be reordered, edited in sequence, exported as HTML, or exported as Markdown with packaged image assets. Scenario material can also seed a video-editing project.

The same runtime contains an early presentation/deck mode with slides, layouts, layers, text, code, images, shapes, connectors, notes, themes, safe areas, grids, snapping, transitions, build animations, presenter and audience views, and importable layout packs. An optional AI operation layer can modify a bounded project snapshot through schema-validated commands rather than returning arbitrary executable code.

This area began as a step-guide generator and later expanded toward presentation authoring. Its final product boundary is not settled, and the step-guide workflow is expected to receive renewed focus before it can be considered stable.

### Record browser and display video

The browser recording workflow supports active-tab capture, selected-area capture inside a tab, webcam-only capture, viewport-preset capture, and the system picker for a tab, window, or display. Multi-source sessions can prepare up to three selected display sources where the browser and operating system support the flow.

Recording controls include countdown, pause, resume, stop, microphone and camera toggles, device selection, microphone level and test recording, echo cancellation, noise suppression, automatic gain control, camera preview, preferred camera resolution and frame rate, and several recording-quality presets. System-audio availability depends on the selected source and browser or operating-system capability.

A session can retain separate camera and microphone material for later composition where supported. After recording, media can be kept in the Gallery, opened in the video editor, downloaded, or deleted.

The browser extension does not currently promise unlimited duration or universal codec behavior. Long recordings, multi-source sessions, memory pressure, service-worker suspension, interrupted writes, and recovery after browser or operating-system failures remain important validation areas.

### Edit short-form video

The alpha video editor is intended primarily for lightweight and short-form editing rather than large professional post-production projects. It uses local projects and project-owned media copies.

Current editing surfaces include multiple video, audio, annotation, and subtitle tracks; clip splitting, duplication, deletion, trim, close-gap operations, speed and volume changes, fades, linked or detached audio/video pairs, transitions and crossfades, direct voice recording, and a stage for text, subtitles, shapes, arrows, lines, and ellipses.

Scene backgrounds can be solid, gradient, or image-based and can be animated. Cursor, click, camera, and action tooling includes experimental cursor-path extraction and correction, zoom or camera-follow behavior, click ripples, spotlight and dwell emphasis, scroll emphasis, motion paths, and automatic processing of selected stable or inactive stretches.

Export supports whole-project or selected-clip output, MP4 or WebM containers, browser-dependent codec choices, quality, dimensions and frame rate controls, and burned-in or sidecar subtitle workflows. Actual encoder support varies by browser, operating system, and hardware and is probed at runtime.

### Extend the video editor with EffectV1 bundles

Sniptale includes an experimental declarative effect format called EffectV1. Bundles can describe reusable clip effects, transitions, overlays, animated titles, lower thirds, callouts, progress cards, and other compositions without importing arbitrary JavaScript into the extension runtime.

Imported bundles are validated, assigned bounded resources, and evaluated in a manifest-declared sandbox that has no extension API authority, no network access, no browser persistence, and no permission to execute imported source code. Malformed output, identity mismatch, unsupported commands, timeouts, and resource-budget violations fail the render request.

A separate authoring SDK is planned for publishing independently so custom compositions can be developed with a coding agent, validated, exported, imported into Sniptale, and reused. The SDK and a hosted team marketplace are not part of this repository today.

### Capture diagnostic context for reproducing defects

An experimental diagnostic mode can retain sanitized recording context such as session metadata, lifecycle state, selected user actions, safe key events, warnings, errors, console signals, and network failures. The goal is to let a developer replay a recording alongside enough bounded evidence to understand how a defect was reproduced.

Typed text, credentials, authorization values, cookies, and unrestricted request bodies are not intended to be retained. Diagnostic data is stored locally and can be exported as JSON or a support ZIP after disclosure. This remains a sensitive feature and should be treated as experimental until its privacy, sanitization, compatibility, and failure behavior have received broader adversarial testing.

### Connect an optional desktop companion

A separately maintained native companion is intended to extend capture beyond the browser. Its contract covers Windows, macOS, and Linux screenshot and recording modes, global or tray-driven actions, screen, window, multi-display and region capture, cursor capture, microphone and system-audio options, and bounded interaction telemetry.

The companion can operate independently or connect to the extension through Chrome native messaging. In the connected flow, captured media can be handed back to the browser workspace so it opens in an editor or enters the local Gallery instead of remaining only as a loose file on disk.

The native companion is not included in this repository or extension artifact. Its distribution, maturity, platform coverage, and installation instructions may differ from the browser extension.

## Local-first does not mean zero network

The main Sniptale workflow is local-first:

- no Sniptale account is required;
- no Sniptale cloud backend is required;
- captures, projects, settings, and media are stored in browser-controlled local storage and IndexedDB;
- the core capture and editing workflows do not require an external AI provider;
- Chrome's built-in AI path is on-device when the browser makes that capability available.

There are explicit exceptions:

1. When the user configures and invokes an external OpenAI-compatible provider, selected prompt and page data are sent to that endpoint. HTTPS remote endpoints and explicit localhost HTTP endpoints are supported.
2. When optional web-snapshot asset capture is enabled, the extension may fetch disclosed same-origin authenticated assets or anonymous external public assets under the snapshot policy.
3. Downloaded or imported files, links, and page content retain the privacy and security characteristics of their source.
4. Browser extension permissions are broad because Sniptale spans capture, downloads, diagnostics, tab coordination, offscreen recording, and an optional native bridge. Persistent host access is optional rather than a mandatory `<all_urls>` grant.

Provider API keys are stored as AES-GCM envelopes. The default transparent mode protects against accidental inspection but is not a defense against a compromised browser profile or extension runtime. Optional passphrase protection keeps passphrase-derived key material only in background memory; after a Manifest V3 worker restart it must be unlocked again. Forgotten passphrases cannot be recovered.

AI request history is designed to retain metadata such as time, model, request type, counts, and status rather than prompts, page payloads, or raw responses. More detail is available in [Security data handling](docs/security/data-handling.md), [Manifest permissions](docs/security/manifest-permissions.md), and the [Threat model](docs/security/threat-model.md).

## An AI-first repository, not an unbounded generator

Sniptale is intentionally structured for agent-driven implementation. In this repository, an owner is meant to be a bounded unit of responsibility, state, reasoning, and verification rather than only a folder name.

The architecture attempts to constrain the most common failure modes of large AI-generated changes:

- sibling runtime implementations do not import each other directly;
- cross-runtime messages are typed and parsed at the receiving boundary;
- page DOM, imported archives, model output, native messages, and other external inputs remain untrusted until validated;
- privileged routes use explicit sender classes, authorization policy, freshness, capabilities or leases, and replay protection where applicable;
- persistent state has named authorities rather than incidental writers spread across UI components;
- dependency direction is checked automatically;
- sandboxed EffectV1 evaluation cannot acquire extension privileges;
- security-sensitive storage, network, diagnostics, permissions, and runtime owners are recorded in machine-readable registries;
- negative paths, cleanup, cancellation, stale state, and partial failure are expected to be demonstrated rather than assumed.

The principal runtime contexts are the background service worker, content script, popup, settings, Gallery, image editor, video editor, scenario editor, web-snapshot viewer, camera recorder, offscreen document, and effect sandbox. Shared code is divided among `foundation`, `runtime-contracts`, `platform`, and `ui` packages, while product workflows and durable app state remain in named application owners.

That structure also carries historical costs. Successive agent-driven iterations have left the codebase highly fragmented, and some areas are more elaborate than their current product value justifies. This is a known trade-off, but no repository-wide rewrite or global change to the engineering approach is currently planned; simplification will remain local and evidence-driven.

See [Repository overview](docs/architecture/repository-overview.md), [Runtime contexts](docs/architecture/runtime-contexts.md), [Storage state authority](docs/architecture/storage-state-authority.md), [Parser architecture](docs/architecture/parser-architecture.md), and [Video editor layering](docs/architecture/video-editor-layering.md).

## Quality guardrails

AI implementation is controlled by a repository-local quality system rather than accepted only because a generated diff looks plausible.

The normal workflow combines:

- TypeScript type checking, ESLint, Prettier, unit and integration tests, and Playwright extension E2E suites;
- dependency-boundary and runtime-topology checks;
- coverage, dead-code, cycle, duplication, complexity, and ownership checks;
- manifest-permission, message-boundary, storage-authority, network-egress, diagnostic-sanitization, and other security guards;
- static-analysis and supply-chain tooling, including repository-controlled Semgrep and CodeQL paths where available;
- deterministic build, release packaging, legal notices, SBOM generation, audit evidence, and rollback procedure;
- dedicated agent skills for architecture review, repository audit, security review, and topology-plan review.

The repository's working convention is to begin with acceptance criteria and non-goals, run a preflight, implement one coherent change, execute the relevant checkpoint, request a separate read-only architecture or security review for high-risk seams, consolidate findings, and close out only after the required proof is green.

Repository-local commands remain the QA authority. GitHub Actions applies the same pushed-range proof to every pull request and update to `main`; it complements the local workflow rather than defining a second validation path.

These guardrails reduce risk; they do not prove correctness. A green pipeline is not a substitute for real-user testing, browser and operating-system compatibility work, production observability, performance profiling, malicious-page testing, fuzzing, or an independent professional security assessment.

The operating model is documented in [AGENTS.md](AGENTS.md), [Implementation rules](docs/engineering/implementation-rules.md), [Code quality](docs/tooling/code-quality.md), and the [Operator handbook](docs/tooling/operator-handbook.md).

## Known gaps and next priorities

The next stage is productization rather than architectural expansion. Priorities include:

- validating every primary workflow on real and hostile pages;
- simplifying interactions and removing abstractions that do not protect a real invariant;
- hardening interrupted capture, service-worker restart, storage-quota, import, export, and recovery behavior;
- profiling full-page capture, long recordings, multi-source media, large projects, and video export under memory pressure;
- stabilizing persisted formats and introducing migrations only when the product is ready to promise compatibility;
- returning the scenario editor to a focused step-guide and manual-authoring workflow;
- completing live recording annotations and deciding which diagnostics are safe enough to expose broadly;
- publishing and documenting the EffectV1 authoring SDK separately;
- defining whether sharing should remain file-based, use user-selected infrastructure, or become a hosted capability without compromising the local-first model;
- completing compatibility and release work for the native companion.

Until those decisions are made, the alpha should be evaluated as a transparent engineering preview rather than a finished replacement for established capture, documentation, or video-production products.

## Repository map

- `apps/extension` — extension runtimes, product features, workflows, composition, and app persistence.
- `packages/foundation` — dependency-minimal reusable domain primitives.
- `packages/runtime-contracts` — cross-runtime wire and data contracts.
- `packages/platform` — browser, storage, transport, observability, media, and security adapters.
- `packages/ui` — reusable presentation primitives.
- `tooling` — quality gates, inventories, security checks, test runners, release tooling, and audit evidence.
- `.agents/skills` — repository-specific review skills used by coding agents.
- `docs` — active architecture, engineering, security, tooling, provenance, and release documentation.

## Documentation

[docs/README.md](docs/README.md) is the sole documentation index. The documentation in this repository was written and revised entirely by AI coding agents under human direction. It may contain inaccuracies, omissions, or descriptions that no longer match the implementation; verify important claims against the code, machine-readable policy, and deterministic checks.

## Contributing

During the alpha phase, focused product and engineering improvement proposals are the most useful contributions. Bug reports have limited value at this stage because substantial stabilization work remains before beta. Structured bug feedback and acceptance testing will become a priority once the project reaches beta.

Sniptale does not currently accept unsolicited external code contributions. Do not submit an implementation patch or pull request unless the repository owner has explicitly requested it. See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

Copyright (C) 2026 Lev Rozhkov.

Sniptale is licensed under the [GNU Affero General Public License v3 or later](LICENSE) (`AGPL-3.0-or-later`). Third-party material copied into release artifacts is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Bundled Manrope font files remain under the [SIL Open Font License 1.1](LICENSES/OFL-1.1.txt).
