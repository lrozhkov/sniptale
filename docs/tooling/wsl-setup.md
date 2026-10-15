# WSL setup and recovery

This document owns the supported WSL environment and recovery procedure. QA commands belong in the [operator handbook](operator-handbook.md), and wrapper behavior belongs in [wrapper-summary.md](wrapper-summary.md).

## Required state

Keep the repository, `node_modules`, temporary files, and Playwright browsers on the WSL Linux filesystem. Node, npm, and npx must resolve to Linux binaries from one pinned runtime. Remove Windows Node paths and Windows profile variables from the repository shell.

Use `/tmp` for `TMPDIR`, `TMP`, and `TEMP`. A repository-dedicated distribution may disable Windows interop in `/etc/wsl.conf`.

Check the environment:

```bash
which python3 node npm npx
node -p "process.platform + ' ' + process.arch"
npm config list
```

The repository path must not be under `/mnt/c`. `process.platform` must be `linux`.

## Install

Install base tools:

```bash
sudo apt-get update
sudo apt-get install -y build-essential curl git python3 python3-pip xvfb
```

Install the Node version from [`.nvmrc`](../../.nvmrc). Install the locked npm package and normalize its reviewed dependency replacements:

```bash
nvm install
nvm use
npm ci --ignore-scripts --prefix tooling/configs/ci/npm
node tooling/ci/npm-runtime.mjs tooling/configs/ci/npm tooling/configs/ci/toolchain.lock.json
mkdir -p ~/.local/bin
SNIPTALE_NODE_BIN="$(dirname "$(nvm which)")"
SNIPTALE_NPM_BIN="$PWD/tooling/configs/ci/npm/node_modules/.bin"
ln -sf "$SNIPTALE_NODE_BIN/node" ~/.local/bin/node
ln -sf "$SNIPTALE_NPM_BIN/npm" ~/.local/bin/npm
ln -sf "$SNIPTALE_NPM_BIN/npx" ~/.local/bin/npx
export PATH="$HOME/.local/bin:$PATH"
hash -r
node tooling/ci/runtime-parity.mjs
```

The runtime-parity command checks Node, npm, npx, executable paths, and their shared npm root against [`toolchain.lock.json`](../../tooling/configs/ci/toolchain.lock.json).

Add `~/.local/bin` to the login-shell `PATH`. Update all three links together when the runtime or repository path changes.

Clone or copy the repository into the Linux filesystem. Preserve uncommitted work before migration. Do not copy `node_modules` between operating systems.

Install repository dependencies:

```bash
npm ci --ignore-scripts
npm run dependencies:normalize
npm rebuild canvas
node node_modules/@ast-grep/cli/postinstall.js
npm run prepare
```

The root manifest permits the install script for the exact locked canvas version. Other dependency scripts remain disabled.

Do not remove or regenerate `package-lock.json` during setup. Install optional local agent files separately with `npm run agents:install`. Maintainers refresh their archive with `npm run agents:pack`.

The repository npm policy owns release-age admission. For an evidenced urgent security fix younger than the configured window, exclude only the exact package for one install command. Do not commit an exclusion to `.npmrc`.

```bash
npm install '<package>@<exact-version>' --min-release-age-exclude='<package>'
```

## Browser smoke prerequisites

```bash
npm run qa:e2e:install
npm run qa:e2e:install:deps
```

`xvfb` supplies a display when WSL has none. The package scripts install Playwright browsers under `.playwright-browsers/`.

## Native window recording acceptance

The discard acceptance spec requires a window manager for real X11 window capture. Bare Xvfb does not supply the window state that Chromium requires. Install `twm` and `x11-utils` if the display has no window manager. Use this command after `npm run qa:e2e:build`:

```bash
printf '%s\n' 'RandomPlacement' 'NoGrabServer' 'NoTitle' 'TitleFont "fixed"' 'MenuFont "fixed"' 'IconFont "fixed"' 'ResizeFont "fixed"' 'IconManagerFont "fixed"' > /tmp/sniptale-twmrc
PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers SNIPTALE_EXTENSION_BUILD_DIR=.tmp/e2e-builds/test PLAYWRIGHT_HEADLESS=0 xvfb-run -a sh -c '
  LC_ALL=C twm -f /tmp/sniptale-twmrc &
  wm_pid=$!
  trap "kill $wm_pid 2>/dev/null || true" EXIT
  npm exec playwright test -- tooling/test/e2e/extension-critical/extension-critical-recording-discard.spec.ts --workers=1
'
```

The spec checks the actual capture surface and distinct window identities. It waits for native X11 titles before Chromium selects the next window. Camera cases use a separate browser profile with test devices.

## Resource overrides

Inspect available resources with `nproc`, `lscpu`, and `free -h`. Use the [operator resource overrides](operator-handbook.md#commands) only after you measure contention. Machine policy checks and clamps the values.

## Recovery

If Windows npm appears in WSL, fix shell configuration until `which node npm npx` returns Linux paths. Then remove `node_modules`. Run the dependency installation procedure again.

If only interactive shells find Node, compare login-shell resolution:

```bash
bash -lc 'which node npm npx && readlink -f "$(which node)" "$(which npm)" "$(which npx)"'
```

Fix all three `~/.local/bin` links and the login-shell `PATH` when this command fails.

If a command cannot create temporary files, retry it with `TMPDIR=/tmp TMP=/tmp TEMP=/tmp`.

If Chromium cannot launch, rerun `npm run qa:e2e:install:deps`. For that failure, check `.playwright-browsers/`. Use a normal WSL terminal that permits browser processes and CDP sockets for that recovery.

If a registry-backed audit cannot reach its source, diagnose with `npm ping` and the audit output. Network or tool bootstrap failure is not passing proof and is not a product defect.
