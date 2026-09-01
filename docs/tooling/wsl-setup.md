# WSL Setup And Recovery

Updated: 2026-07-25

Canonical environment setup for Sniptale on WSL. Workflow and QA decisions remain in the [optional agent workflow](../agent-tooling/AGENTS.md); this document only establishes and repairs the Linux toolchain.

## Target State

The repository and `node_modules` live on the WSL Linux filesystem, Node.js/npm resolve to Linux binaries, Windows Node paths are absent from `PATH`, temporary directories resolve to `/tmp`, and Playwright browsers live under `.playwright-browsers/`.

Check:

```bash
which python3
which node
which npm
node -p "process.platform + ' ' + process.arch"
npm config list
```

Expected results include `process.platform = linux`, Linux paths for Node/npm, no `C:\Program Files\nodejs` configuration, and a repository path such as `~/dev/sniptale` rather than `/mnt/c/...`.

For a repo-dedicated distro, disable Windows interop in `/etc/wsl.conf`, keep `/mnt/c` out of `PATH`, unset `APPDATA`, `LOCALAPPDATA`, and `USERPROFILE`, and set `TMPDIR`, `TMP`, and `TEMP` to `/tmp` in login-shell configuration.

## Install Base Tools

```bash
sudo apt-get update
sudo apt-get install -y build-essential curl git python3 python3-pip xvfb
```

`xvfb` supports headless extension smoke when WSL has no `DISPLAY`.

## Install Linux Node.js 24

Install through the current supported `nvm` bootstrap, then:

```bash
source ~/.bashrc
nvm install 24.18.0
nvm use 24.18.0
npm install --global npm@11.19.1 --ignore-scripts --min-release-age-exclude=npm
hash -r
```

The repository `.nvmrc` pins the same exact Node `24.18.0` developer runtime and is checked against package, CI, container, and toolchain authorities. npm remains pinned separately to `11.19.1` by `packageManager`, `devEngines`, and the CI npm lock.

Run `node tooling/ci/runtime-parity.mjs` before installing repository dependencies. The blocking receipt checks `node`, `npm`, and `npx` versions, their PATH entries and canonical real paths, and requires npm/npx to resolve from one npm package root. The expected package-manager identity is declared by `packageManager` and enforced by `devEngines`; do not update the lock with another npm version. For manual diagnosis, inspect `which node npm npx` and `readlink -f "$(which node)" "$(which npm)" "$(which npx)"` together rather than checking only the Node version.

`npm@11.19.1` is an intentional urgent-security exception to the seven-day age window: it fixes the high-severity `tar` advisory still present in npm 12.0.2. CI obtains the same package through `tooling/configs/ci/npm/package-lock.json`, verifies its registry integrity, and retains no permanent age exclusion.

If non-interactive tools cannot see Node, expose the complete pinned runtime through `~/.local/bin`:

```bash
mkdir -p ~/.local/bin
SNIPTALE_NODE_BIN="$(dirname "$(nvm which 24.18.0)")"
ln -sf "$SNIPTALE_NODE_BIN/node" ~/.local/bin/node
ln -sf "$SNIPTALE_NODE_BIN/npm" ~/.local/bin/npm
ln -sf "$SNIPTALE_NODE_BIN/npx" ~/.local/bin/npx
```

Never update only one of these links. A stale `node`, `npm`, or `npx` path is a blocking runtime-parity failure even when the other two commands report the expected versions.

Ensure login and interactive shells export:

```bash
export PATH="$HOME/.local/bin:$PATH"
export TMPDIR=/tmp
export TMP=/tmp
export TEMP=/tmp
```

Verify non-interactive resolution:

```bash
bash -lc 'which node npm npx && node --version && npm --version && npx --version && node tooling/ci/runtime-parity.mjs'
```

## Place The Repository In WSL

Clone into the Linux filesystem:

```bash
mkdir -p ~/dev
cd ~/dev
git clone <your-remote-url> sniptale
cd sniptale
```

Open the Linux files from Windows through `\\wsl$\Ubuntu\home\<your-user>\dev\sniptale` when needed.

If migrating an existing `/mnt/c` worktree, first inspect `git status` and `git remote -v`, preserve uncommitted work deliberately, then copy or clone into WSL. Do not carry `node_modules` across operating systems.

## Install Repository Dependencies

`package-lock.json` is tracked release authority. Do not delete or regenerate it during environment setup.

From the repository root:

```bash
rm -rf node_modules
npm ci --ignore-scripts
npm rebuild canvas
node node_modules/@ast-grep/cli/postinstall.js
npm run prepare
```

Repository-local agent instructions and skills are separate from dependency installation. Install them explicitly with `npm run agents:install` only when wanted; see [Optional agent tooling](../agent-tooling/README.md).

Confirm native packages include Linux artifacts:

```bash
ls node_modules/@esbuild
```

If only a Windows artifact exists, recheck Node/npm resolution, remove `node_modules`, and run `npm ci` again.

Repository resolution keeps ordinary package releases behind a seven-day admission window. Do not disable `min-release-age` to take a routine update early. When a published upstream security fix is both reachable in Sniptale and too young for the window, admit only that exact package for the one install command:

```bash
npm install '<package>@<exact-version>' --min-release-age-exclude='<package>'
```

Record the upstream security evidence in the task manifest, verify that no `min-release-age-exclude` line was added to `.npmrc`, and run the dependency wave through its normal review and closeout. The exclusion applies only to the named package; its transitive dependencies remain subject to the seven-day window.

## Verify The Environment

Run small setup checks without creating a fake closeout diff:

```bash
npm run typecheck
npm run test:unit
npm run build
```

Use `npm run qa:preflight` for repository context. Use `qa:release-harness`, `qa:checkpoint`, required independent review, and `qa:closeout` only for a real implementation diff according to the [optional agent workflow](../agent-tooling/AGENTS.md).

Check the resource ceiling seen by WSL with `nproc`, `lscpu`, and `free -h`. A `.wslconfig` entry such as `processors=12` and `memory=16GB` permits the VM to reach those values; it does not reserve them away from Windows. On a 6-core/12-thread i7-8700K, the QA scheduler therefore defaults to 8 CPU tokens rather than treating all 12 logical threads as independent physical cores. It also leaves roughly 3 GiB outside the 12 GiB QA memory budget so Windows/WSL services do not force normal verification into swap.

Use `SNIPTALE_QA_CPU_TOKENS`, `SNIPTALE_QA_MEMORY_MIB`, or `SNIPTALE_QA_VITEST_MAX_WORKERS` only for a measured operator override. Values must be positive integers, the memory budget must be at least 6144 MiB, and all values are clamped to WSL-visible ceilings. Heavy lane reservations are never reduced just to fit a smaller profile, so WSL must expose at least 7168 MiB total memory. Release requires at least 2 CPU tokens. Lower CPU tokens or Vitest workers when Windows is doing other sustained work; do not use an automatic/unbounded worker mode.

`ci:proof` and `ci:release` run directly in WSL without Docker and use the same resource-profile owner as their GitHub container execution. The release gate deliberately saturates the visible ceiling only during exclusive full-product work. Windows still shares the physical processor and RAM, so lower the explicit CPU, memory, or worker overrides when interactive host work must remain responsive.

`ci:proof` owns full product coverage and product tests, deterministic repository controls, the Fast audit profile, and a subsequent non-competing harness wave. Product-only candidates use the affected harness closure; CI/tooling/shared-control changes and scheduled gates run the complete partitioned harness under the external runner's shared worker budget. `ci:release` first requires the exact proof for the unchanged workspace tree, then owns only release-time supply-chain/history/CodeQL work and the release build/archive. CI runs mutation profiles afterward in the isolated non-blocking advisory-artifact job. If a blocking control fails because the registry or a configured external binary is unavailable, repair DNS/proxy/TLS/registry/toolchain access rather than treating the result as a product defect.

## Extension Smoke

Install the repo-local browser and Linux dependencies once:

```bash
npm run qa:e2e:install
npm run qa:e2e:install:deps
```

Run the smoke path:

```bash
npm run qa:e2e
```

The runner builds `dist/`, starts under `xvfb-run` when needed, loads the unpacked extension, and attaches Playwright over CDP. It pins temporary/browser storage and remains separate from product/harness wrappers.

## Recovery

### Windows npm leaked into WSL

Symptoms include `WSL 1 is not supported`, Windows paths in `npm config list`, or Windows native packages. Fix shell configuration until `which node npm npx` resolves inside WSL, then run `rm -rf node_modules && npm ci`.

### Node missing from non-interactive shells

Run `bash -lc 'which node npm npx && readlink -f "$(which node)" "$(which npm)" "$(which npx)"'`. If interactive resolution works but this fails, replace all three `~/.local/bin` links and the login-shell `PATH` export above.

### Temporary-directory permissions fail

Retry the affected command with:

```bash
TMPDIR=/tmp TMP=/tmp TEMP=/tmp <command>
```

### Playwright cannot launch Chromium

Run `npm run qa:e2e:install:deps`, verify `.playwright-browsers/` exists, and confirm `xvfb-run` is installed. Restricted sandboxes may not allow Chromium/CDP sockets or browser processes; use a normal WSL terminal for runtime smoke.

### Registry-backed audit fails

For an explicitly requested audit, diagnose with `npm ping` and the audit adapter output. Network/bootstrap failure is environment evidence, not a passing audit and not a product regression.

## Rules Of Thumb

- Use Linux `npm run ...` and `npm exec ...`; do not use Windows `cmd /c npm ...` or bare `npx ...` from WSL.
- Keep the repository, dependencies, temporary files, and Playwright browser bundle on the Linux filesystem.
- Preserve `package-lock.json` and use `npm ci` for reproducible setup/recovery.
- Use repository npm scripts as canonical entrypoints; use direct tools only for focused diagnosis.
