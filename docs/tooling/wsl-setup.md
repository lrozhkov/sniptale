# WSL Setup And Recovery

Updated: 2026-07-25

Canonical environment setup for Sniptale on WSL. Workflow and QA decisions remain in `AGENTS.md`; this document only establishes and repairs the Linux toolchain.

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

## Install Linux Node.js 22

Install through the current supported `nvm` bootstrap, then:

```bash
source ~/.bashrc
nvm install 22
nvm use 22
hash -r
```

Verify `which node`, `which npm`, `node --version`, `npm --version`, and `npm config list` before installing repository dependencies.

If non-interactive tools cannot see Node, expose the active Linux binaries through `~/.local/bin`:

```bash
mkdir -p ~/.local/bin
ln -sf "$(dirname "$(which node)")/node" ~/.local/bin/node
ln -sf "$(dirname "$(which npm)")/npm" ~/.local/bin/npm
```

Ensure login and interactive shells export:

```bash
export PATH="$HOME/.local/bin:$PATH"
export TMPDIR=/tmp
export TMP=/tmp
export TEMP=/tmp
```

Verify non-interactive resolution:

```bash
bash -lc 'which node && which npm && node --version && npm --version'
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
npm ci
```

Confirm native packages include Linux artifacts:

```bash
ls node_modules/@esbuild
```

If only a Windows artifact exists, recheck Node/npm resolution, remove `node_modules`, and run `npm ci` again.

## Verify The Environment

Run small setup checks without creating a fake closeout diff:

```bash
npm run typecheck
npm run test:unit
npm run build
```

Use `npm run qa:preflight` for repository context. Use `qa:release-harness`, `qa:checkpoint`, required independent review, and `qa:closeout` only for a real implementation diff according to `AGENTS.md`.

Check the resource ceiling seen by WSL with `nproc`, `lscpu`, and `free -h`. A `.wslconfig` entry such as `processors=12` and `memory=16GB` permits the VM to reach those values; it does not reserve them away from Windows. On a 6-core/12-thread i7-8700K, the QA scheduler therefore defaults to 8 CPU tokens rather than treating all 12 logical threads as independent physical cores. It also leaves roughly 3 GiB outside the 12 GiB QA memory budget so Windows/WSL services do not force normal verification into swap.

Use `SNIPTALE_QA_CPU_TOKENS`, `SNIPTALE_QA_MEMORY_MIB`, or `SNIPTALE_QA_VITEST_MAX_WORKERS` only for a measured operator override. Values must be positive integers, the memory budget must be at least 4096 MiB, and all values are clamped to WSL-visible ceilings. Heavy lane reservations are never reduced just to fit a smaller profile, so WSL must expose at least 5120 MiB total memory. Lower CPU tokens or Vitest workers when Windows is doing other sustained work; do not use an automatic/unbounded worker mode.

`qa:audit` owns live npm audit, supply-chain inventory, full coverage, and external engines. It is not a normal environment or implementation gate. If an explicitly requested audit fails because the registry is unavailable, repair DNS/proxy/TLS/registry access rather than treating the result as a product defect.

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

Symptoms include `WSL 1 is not supported`, Windows paths in `npm config list`, or Windows native packages. Fix shell configuration until `which node` and `which npm` resolve inside WSL, then run `rm -rf node_modules && npm ci`.

### Node missing from non-interactive shells

Run `bash -lc 'which node && which npm'`. If interactive resolution works but this fails, add the `~/.local/bin` links and login-shell `PATH` export above.

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
