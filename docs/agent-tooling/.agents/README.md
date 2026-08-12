# Sniptale Agent Bridge

Use `AGENTS.md` as the compact workflow contract.

Read `docs/engineering/implementation-rules.md` and `docs/architecture/repository-overview.md` before non-trivial implementation, then follow the deeper-doc routing in `AGENTS.md`. Product UX and visual direction use `DESIGN.md`.

Use `npm run qa:preflight` for useful read-only context. The normal delivery order is implementation, applicable harness proof, `qa:checkpoint`, required independent review for a green high-risk candidate, then `npm run qa:closeout -- -m "message"`.

Do not use this bridge as a second startup checklist. Nonstandard/debug/operator workflows live in `docs/tooling/wrapper-summary.md` and `docs/tooling/operator-handbook.md`; whole-repository audit requires an explicit user request.
