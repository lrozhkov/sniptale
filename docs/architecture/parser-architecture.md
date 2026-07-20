# Parser architecture

Content parsing has one canonical flow:

```text
resolvePageProfile() -> buildPageSnapshot() -> parseCapturedPage() -> ParsedDocument -> projectors
```

`resolvePageProfile()` selects vendor, application family, page kind, and preferred roots. `buildPageSnapshot()` captures live and virtual DOM seams, iframe context, payload traces, and page context. `parseCapturedPage()` selects the registered pipeline. Extractors populate `ParsedDocument`, and projectors derive AI-pick, JSON, Markdown, and apply-back data from that document. Canonical types are exported by `@sniptale/runtime-contracts/dom-tree`.

## Owners

- `apps/extension/src/content/parser/page-profile/**` owns product detection and scored detector results.
- `apps/extension/src/content/parser/page-snapshot/**` owns snapshot capture, root selection, and payload extraction.
- `apps/extension/src/content/parser/backends/**` owns the selected DOM parser backend contract and retained legacy TreeWalker implementation.
- `apps/extension/src/content/parser/pipelines/**` owns pipeline registration, routing, backend orchestration, and direct extractor composition.
- `apps/extension/src/content/parser/ir/**` owns canonical document helpers and legacy normalization.
- `apps/extension/src/content/parser/pipelines/compatibility/live-dom.ts` adapts live DOM into the same root orchestration used by captured snapshots.

## Invariants

Detection occurs only in the page-profile owner. Unknown pages use the conservative safe fallback and do not guess editable fields. Direct extractors are preferred for stable vendor seams; new implicit `canParse()` routing does not extend the legacy backend.

Extraction patterns are shared across outputs. AI-pick, JSON, Markdown, and apply-back do not own separate parser heuristics; format-specific behavior stays in projectors or adapters.

Normalization receives page context from the snapshot, explicit extractor context, the live-DOM compatibility adapter, or legacy document metadata. It does not read `window.location` as hidden authority.

Editable targets come from explicit `TargetRef` data or a stable legacy-compatible selector. Low-confidence content remains export-only, and missing or stale targets fail apply-back without broad selector guesses.

## Diagnostics

Diagnostic export preserves `page-profile.json`, `detector-trace.json`, `root-selection.json`, `payload-trace.json`, `pipeline-trace.json`, and `parser-tree.json`. These traces are the first evidence for classification, root selection, payload, or fallback failures.

## Proof

A routing change proves detector/profile and pipeline behavior, including miss and downgrade paths. A document-contract change proves all affected projectors. An editable-target change proves apply-back success and missing/stale target failure. Snapshot, facade, extractor, projector, and orchestration consumers that share a changed public contract are included transitively.
