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

Install the Node version from [`.nvmrc`](../../.nvmrc), then install the package manager declared by [`package.json`](../../package.json):

```bash
nvm install
nvm use
npm install --global "$(node -p 'require("./package.json").packageManager')" --ignore-scripts --min-release-age-exclude=npm
hash -r
node tooling/ci/runtime-parity.mjs
```

The runtime-parity command validates Node, npm, npx, PATH resolution, real executable paths, and their shared npm package root against [`toolchain.lock.json`](../../tooling/configs/ci/toolchain.lock.json).

If non-interactive shells cannot find the pinned runtime, link all three executables together:

```bash
mkdir -p ~/.local/bin
SNIPTALE_NODE_BIN="$(dirname "$(nvm which)")"
ln -sf "$SNIPTALE_NODE_BIN/node" ~/.local/bin/node
ln -sf "$SNIPTALE_NODE_BIN/npm" ~/.local/bin/npm
ln -sf "$SNIPTALE_NODE_BIN/npx" ~/.local/bin/npx
```

Add `~/.local/bin` to the login-shell `PATH`. Do not update only one link.

Clone or copy the repository into the Linux filesystem. Preserve uncommitted work before migration. Do not copy `node_modules` between operating systems.

Install repository dependencies:

```bash
npm ci --ignore-scripts
npm rebuild canvas
node node_modules/@ast-grep/cli/postinstall.js
npm run prepare
```

Do not delete or regenerate `package-lock.json` during setup. Install optional local agent files separately with `npm run agents:install`; maintainers refresh their archive with `npm run agents:pack`.

The repository npm policy owns release-age admission. For an evidenced urgent security fix that is younger than the configured window, exclude only the exact package for one install command. Do not commit an exclusion to `.npmrc`.

```bash
npm install '<package>@<exact-version>' --min-release-age-exclude='<package>'
```

## Browser smoke prerequisites

```bash
npm run qa:e2e:install
npm run qa:e2e:install:deps
```

`xvfb` supplies a display when WSL has none. Playwright browsers are installed under `.playwright-browsers/` by the package scripts.

## Resource overrides

Inspect available resources with `nproc`, `lscpu`, and `free -h`. Use the [operator resource overrides](operator-handbook.md#commands) only after measuring contention. Machine policy validates and clamps the values.

## Recovery

If Windows npm appears in WSL, fix shell configuration until `which node npm npx` returns Linux paths. Then remove `node_modules` and run the dependency installation procedure again.

If only interactive shells find Node, compare login-shell resolution:

```bash
bash -lc 'which node npm npx && readlink -f "$(which node)" "$(which npm)" "$(which npx)"'
```

Repair all three `~/.local/bin` links and the login-shell `PATH` when this command fails.

If a command cannot create temporary files, retry it with `TMPDIR=/tmp TMP=/tmp TEMP=/tmp`.

If Chromium cannot launch, rerun `npm run qa:e2e:install:deps`, verify `.playwright-browsers/`, and use a normal WSL terminal that permits browser processes and CDP sockets.

If a registry-backed audit cannot reach its source, diagnose with `npm ping` and the audit output. Network or tool bootstrap failure is not passing proof and is not a product defect.
