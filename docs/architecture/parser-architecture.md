# Parser architecture

Content parsing has one flow:

```text
buildPageSnapshot() --calls--> resolvePageProfile()
buildPageSnapshot() -> CapturedPageSnapshot -> parseCapturedPage() -> ParsedDocument -> projectors
```

`@sniptale/runtime-contracts/dom-tree` owns the shared types.

## Owners

- `apps/extension/src/content/parser/page-profile/**` owns product detection and scored results.
- `apps/extension/src/content/parser/page-snapshot/**` owns snapshot capture, root selection, page context, and payload traces.
- `apps/extension/src/content/parser/backends/**` owns parser backend contracts and the retained TreeWalker backend.
- `apps/extension/src/content/parser/pipelines/**` owns registration, routing, backend orchestration, and extractor composition.
- `apps/extension/src/content/parser/ir/**` owns parsed-document helpers and legacy normalization.
- `apps/extension/src/content/parser/pipelines/compatibility/live-dom.ts` adapts live DOM to snapshot-root orchestration.

## Rules

Keep detection in `page-profile`. Route unknown pages to the conservative fallback. Prefer direct extractors for stable vendor seams. Do not add implicit `canParse()` routing to the legacy backend. Keep shared extraction in pipelines and extractors. Derive AI-pick, JSON, Markdown, and apply-back output from `ParsedDocument`.

Pass page context into normalization explicitly. Do not read `window.location` from normalization. Build editable targets from `TargetRef` or a stable legacy selector. Treat low-confidence content as export-only. Reject missing or stale apply-back targets.

## Diagnostics and proof

Diagnostic export retains `page-profile.json`, `detector-trace.json`, `root-selection.json`, `payload-trace.json`, `pipeline-trace.json`, and `parser-tree.json`.

For routing changes, prove profile selection, pipeline selection, miss, and downgrade. For document-contract changes, prove every affected projector. For editable-target changes, prove success and missing or stale target failure. Include transitive consumers of each changed parser contract.
