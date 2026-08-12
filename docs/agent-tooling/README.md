# Optional Agent Tooling

This directory is the tracked, reviewable source for Sniptale's optional repository-local agent workflow and review skills. Nothing installs it automatically through `npm ci`, lifecycle scripts, Git hooks, CI, or QA.

From the repository root, install local copies with:

```bash
npm run agents:install
```

The command copies `AGENTS.md` and `.agents/**` into the repository root. Those destinations are ignored by Git. Existing files are left untouched when they differ from this kit; use `npm run agents:install -- --force` only when replacing local changes is intentional.

Remove unchanged installed copies with `npm run agents:remove`. The command preserves modified files unless `--force` is explicit and never removes unrelated files under `.agents/`.
