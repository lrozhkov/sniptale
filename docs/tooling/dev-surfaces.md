# Development surfaces

`dev:surface` opens production pages with the existing browser test adapters. It uses the current checkout. It does not require another worktree. Generated state, browser profiles, logs, and captures stay in `.tmp/dev-surface/`.

## Start and select

```sh
npm run dev:surface -- list
npm run dev:surface -- gallery-editor --fixture .tmp/project-backup.zip
npm run dev:surface -- image-editor --id IMAGE_ID
npm run dev:surface -- video-editor --id PROJECT_ID
npm run dev:surface -- settings --locale ru --theme light
```

The launcher prints a localhost URL and the worktree path. Open that URL in your browser. A manual browser needs no Playwright session. Source mode uses port 4188 by default. `--port` selects another port. The server continues after the command returns. `--foreground` keeps a new server attached to the terminal.

The seven main profiles are `video-editor`, `image-editor`, `gallery-editor`, `popup`, `settings`, `library`, and `scenario-editor`. Additional profiles are `components`, `image-inspector`, and `audio-preview`. The main profiles mount production page entries. Additional profiles reuse existing diagnostic pages.

`--fixture` selects one supported media backup archive for production import. An extension build ZIP is not a media backup. The launcher retains production archive validation. Successful import retains local edits through reload and navigation. An import failure displays an error and prevents page admission. The browser does not substitute a generated project after an archive failure.

`--id` selects the existing image, media, scenario, or video project for that profile. Without an ID, the browser selects a suitable existing root when one exists. The diagnostic report identifies the selected root. `window.__sniptaleDevSurface` reports preparation status, selected identity, composition dimensions, and errors in a manual browser.

## Source and built modes

Source mode serves current source files with HMR or page reload. The annotation sandbox has its own watched build and closes with the server. It does not require a complete extension build after each source change.

```sh
npm run qa:e2e:build
npm run dev:surface -- library --mode built --build-dir .tmp/e2e-builds/test
```

Built mode serves the official test-e2e artifact, including its generic launcher. A normal release build can omit harness pages. The launcher refuses a missing built entry and reports the required build command. Stop a server before changing its mode, artifact directory, or fixture archive. Compatible page URLs can share the authenticated server for this checkout.

## Managed diagnostics

```sh
npm run dev:surface -- gallery-editor --fixture .tmp/project-backup.zip \
  --viewport 1280x560 --screenshot --errors --trace
npm run dev:surface -- video-editor --id PROJECT_ID --time 2 --screenshot
npm run dev:surface -- image-editor --id IMAGE_ID --tool Rectangle --screenshot
```

Managed diagnostics require the installed Playwright Chromium browser. The browser context sets its CSS viewport and DPR 1 before navigation. The default is 1920×900. Supported presets also include 1280×560, 1366×600, 1536×700, and 2560×1280. A manual external browser controls its own viewport. CSS viewport dimensions do not change project or media composition dimensions. The report provides both values separately.

`--screenshot`, `--errors`, and `--trace` create requested artifacts under `.tmp/dev-surface/runs/`. Each diagnostic run also writes `summary.json`. Browser profiles retain imported data between managed runs on the same port. Close other managed sessions before another run uses that profile. Managed gallery diagnostics select Advanced editing through the production chooser when it appears. A manual URL retains the production mode choice.

`--time` supports the video and gallery editors. Native video navigation uses the visible playhead control and selects the nearest available frame. Gallery navigation clicks the visible ruler and checks the accepted position within two timeline pixels or 0.05 seconds. These operations use production interactions. They do not write internal project state.

`--tool` supports the image editor, image inspector, and gallery editor. `--inspector` supports the same profiles. Pass the exact accessible button label in the selected locale. Unavailable, ambiguous, or disabled controls fail explicitly. Other profile combinations refuse these options before browser startup.

## Inspect and stop

```sh
npm run dev:surface -- status
npm run dev:surface -- stop
npm run dev:surface -- stop --port 4189
```

Status and stop compare the live loopback server with this checkout's stored process identity and token. A stale PID file cannot authorize a signal to another process. An incompatible or unverified server requires another port or an explicit stop of its actual owner. Stop closes the HTTP server, source watcher, and annotation sandbox watcher.
