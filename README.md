# Sniptale

[![Release](https://img.shields.io/github/v/release/lrozhkov/sniptale?sort=semver&label=Release)](https://github.com/lrozhkov/sniptale/releases/latest) [![License](https://img.shields.io/github/license/lrozhkov/sniptale?label=License)](LICENSE)

**Snip the web. Tell the story.**

Sniptale is a local-first browser workspace for capturing web pages and turning them into annotated screenshots, videos, step-by-step guides, and interactive tours. It combines page tools, image and video editors, and a local media library in a Chromium Manifest V3 extension.

The core workspace runs in your browser without a Sniptale account or hosted backend. Capture a page, refine the result, organize your work, and export it as files you control.

[Features](#features) · [Installation](#installation) · [Build from source](#build-from-source) · [Documentation](docs/README.md)

> **Alpha software.** Project and archive formats may change between versions. Keep separate backups of important work.

## Features

### Screenshots and page preparation

Capture the visible area, a full page, or a selected region. You can also capture a window or screen through the browser's source picker. Start from the extension popup, page toolbar, context menu, keyboard shortcut, or a saved quick action.

Prepare the page before capture: edit text, adjust element styles, apply viewport presets, and set a countdown. Choose whether to download the result, copy it to the clipboard, open it in the image editor, or retain it in the Library. Quick actions combine capture settings and destinations for repeatable workflows.

### On-page annotation and design review

Annotate the live page with element-aligned frames, highlights, numbered steps, callouts, drawing tools, and blur. Customize borders, fills, spacing, shadows, and annotation presets without manually aligning every mark to the page.

Design review attaches feedback to specific page elements. Add comments, inspect and adjust typography, dimensions, spacing, backgrounds, and borders, then navigate feedback from a searchable list. Element paths and structured element data can be copied for handoff.

### Image editing

Open a capture or import an image from a file, the clipboard, or drag and drop. Crop and resize images, manage layers and groups, align objects with snapping, and add text, arrows, connectors, shapes, step labels, and blur.

Style the composition with backgrounds, padding, browser-window frames, and image effects. Reuse tool presets, export the finished image, or keep an editable document for later changes.

### Screen and camera recording

Record a browser tab, a selected tab region, a window, a display, or the webcam. Configure microphone and camera inputs, recording quality, countdown, and camera presentation. Pause and resume a session before saving it to the Library, downloading it, or opening it in the video editor.

Camera and microphone material can be retained separately for later composition where supported. System audio and available capture sources depend on the browser and operating system.

### Video editing and review

Build a video on a multitrack timeline with video, audio, images, text, shapes, and subtitles. Trim, split, arrange, and retime clips; add effects and transitions; adjust camera overlays and framing. Recordings with retained interaction data can also use cursor and action-aware editing tools.

For lighter work, open **Annotate and quick edit** from the Library. Add comments to a timestamp or interval, mark a region of the frame, inspect recorded actions, cut sections, and change interval speed. Save or download an edited copy without replacing the source, download a selected fragment, or export a Markdown review report.

The video editor exports an entire project, a selected range, or a selected clip as MP4 or WebM, with resolution, quality, and frame-rate controls. Codec availability depends on the browser and device.

### Step-by-step guides

Create illustrated instructions in the Scenario editor from captured steps, imported images, or video frames. Organize content into sections and numbered steps with headings, rich text, notes, captions, and images. Choose stacked, side-by-side, comparison, or text layouts, and reuse saved step templates.

Edit images without leaving the guide workflow, customize document appearance, and configure page size and pagination. Export a self-contained HTML document or a Markdown archive with image assets, or use the browser's print dialog to print or save as PDF.

### Interactive tours

Create an interactive walkthrough alongside a guide. Combine screenshot slides and navigation screens with clickable hotspots, annotations, highlights, blur, redaction masks, zoom, and transitions. Configure next-step actions, jumps between slides, and navigation buttons for non-linear walkthroughs.

Add narration to slides or individual interactive elements, adjust playback timing, and choose manual navigation or autoplay. Preview the result and export a self-contained HTML file with its images, audio, and player, ready to open without the extension.

### Local media library

The **Library** brings together captures, recordings, editable projects, guides, saved web snapshots, and exports. Search, sort, tag, and filter items by properties such as file type, source, size, resolution, duration, and date. Save frequently used views, preview media, and reopen it in the appropriate editor or viewer.

Use multi-selection for batch actions and downloads. Export all or selected work to a ZIP backup and restore it later. Storage tools help manage retained data, while Library and Drafts views distinguish saved work from in-progress material.

### Page export and web snapshots

Extract page content as Markdown or structured JSON, or export selected open tabs in a batch. Combine text, tables, images, attachments, page metadata, and screenshots in a ZIP package for research, documentation, or handoff.

Save a web snapshot to keep a full-page screenshot together with a sanitized reference document and source metadata. Open it in a dedicated read-only viewer, using the captured image for visual fidelity or the static document for inspecting page content. Snapshots do not preserve an active browser session.

### Workspace customization

Configure keyboard shortcuts, context-menu entries, quick actions, viewport and save presets, and editor presets. Command palettes provide access to common actions across the workspace. The interface supports English and Russian, with system, light, and dark themes.

## Installation

Use Chrome meeting the [minimum supported browser version](docs/engineering/project-facts.md). Capture, audio, and codec support may differ in other Chromium-based browsers.

1. Download the extension archive, named `sniptale_<version>_<date>.zip`, from the [latest GitHub Release](https://github.com/lrozhkov/sniptale/releases/latest) and extract it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the extracted directory containing `manifest.json`.

Open Sniptale from the browser toolbar. Grant page, microphone, or camera access when needed for the workflow you choose. Keyboard shortcuts can be configured at `chrome://extensions/shortcuts`.

This README describes the current `main` branch. Published releases may contain an earlier feature set; build from source to use the current implementation.

## Build from source

Use the Node.js version pinned in [`.nvmrc`](.nvmrc) and the npm version specified by `packageManager` in [`package.json`](package.json).

```bash
git clone https://github.com/lrozhkov/sniptale.git
cd sniptale
npm ci
npm run build:release
```

The unpacked extension is written to `dist/`. Load that directory through **Load unpacked** at `chrome://extensions`. After rebuilding, reload the extension from the same page.

For local development, start the Vite development server with `npm run dev`. Environment-specific setup is documented in the [WSL setup guide](docs/tooling/wsl-setup.md).

## Local data and privacy

Captures, projects, drafts, and settings are stored in your browser profile using local extension storage and IndexedDB. Use Library backups to keep an independent copy of your work before removing the extension or clearing browser data.

Local-first does not mean every optional feature is offline. Optional integrations and network-assisted snapshot capture have separate network behavior, described in [Data handling](docs/security/data-handling.md). See [Manifest permissions](docs/security/manifest-permissions.md) for browser access requirements.

## Project structure

Sniptale uses TypeScript, React, Vite, and CRXJS, with Fabric.js for image editing and browser media APIs for recording and video processing.

```text
apps/extension/              Extension pages, browser runtimes, and product workflows
packages/foundation/         Shared domain primitives
packages/runtime-contracts/  Cross-runtime data and message contracts
packages/platform/           Browser, storage, and media adapters
packages/ui/                 Shared interface components
docs/                        Project documentation
tooling/                     Development and release utilities
```

## Documentation and contributing

Start with the [documentation index](docs/README.md) for architecture, data handling, and development guides. The [repository overview](docs/architecture/repository-overview.md) maps the main source areas.

Bug reports and focused product proposals are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for participation and external code-contribution policy, and follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately as described in [SECURITY.md](.github/SECURITY.md).

## License

Copyright (C) 2026 Lev Rozhkov.

Sniptale is licensed under the [GNU Affero General Public License v3 or later](LICENSE) (`AGPL-3.0-or-later`). Third-party notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
