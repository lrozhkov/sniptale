# Layout adaptation and proof sizes

[Design index](index.md) · [Surface boundaries](surfaces.md) · [Text fitting](localization.md)

## Target contracts

| Surface | Existing sizing and overflow contract |
| --- | --- |
| Desktop application | Minimum 1280 CSS px. Outer workspace scrolls horizontally below that width |
| Quick review content | Its existing 1254px inner content minimum is distinct from the desktop page minimum |
| Extension popup | Existing 392×560px bounds and hidden outer overflow. No desktop minimum |
| Embedded player or content UI | Its own declared host viewport, touch, and scrolling contract |
| Reference catalog | Can stack theme columns. This does not prescribe product application breakpoints |

Keep the title, current selection, primary command, blocking status, and recovery reachable at the surface minimum. Constrain every scroll region through its layout owner. Avoid accidental page overflow caused by a child that cannot shrink. Preserve intentional timeline zoom scrolling and the desktop minimum-width scroll path.

## Compaction order

1. Measure available space after rails, padding, dividers, and trailing actions.
2. Reduce only declared spacing variants. Do not shrink font roles or hit targets arbitrarily.
3. Hide lower-priority captions only for an established icon-and-text family with an approved icon-only variant.
4. Preserve the full accessible name and native browser hint. Keep critical text-only commands explicit.
5. Stack a control below its label before changing its representation. Measure options on the full available group width. Keep a single row when it fits without text wrapping. Use a dropdown only when the full-width control still cannot fit. Preserve compact icon controls and existing overflow menus.
6. When the desktop surface reaches its minimum, preserve that width and use the outer horizontal scroll owner.

Do not change representation during an active press, editing transaction, drag, or menu selection. Recompute after content changes, font readiness, and owner resizing. Avoid a hidden-caption measurement loop. Do not invent one universal viewport breakpoint for all toolbars or inspectors.

## Source-backed local patterns

| Existing owner | Pattern to preserve |
| --- | --- |
| gallery/video-review/use-toolbar-layout.ts | Actual-fit measurement: balanced spacing, compact spacing, priority caption removal, then stacking |
| gallery/video-review/panel-layout.tsx | Effective size clamping retains requested inspector/timeline sizes for later expansion |
| gallery/video-review/inspector.css | Two-column All view at content-container 524px. Nested settings stay one column |
| ui/paint-selector/trigger.css | Label/value stacking at local container 280px |
| scenario-editor/page-shell/inspector.css | Numeric value adjustment at local container 300px and intrinsic row fitting |
| packages/ui/src/inspector-shell | Expanded/collapsed width transitions remain with the shell |
| packages/ui/src/styles/ai-modal/shell.css | Bounded modal, scrolling body, nonshrinking header/footer, wrapping footer commands |
| features/scenario/tour-player/player.css | Embedded caption reduction at 480px and coarse-pointer 44px targets |
| gallery/video-review/timeline.tsx | Fit zoom suppresses incidental overflow. Larger zoom retains timeline-owned horizontal scrolling |

These are owner-specific patterns, not mandatory sizes for unrelated controls. Container thresholds must not become page-width breakpoints. The source inventory does not establish a universal automatic docking breakpoint.

## Required proof

Primary CSS viewports: 1280×560 and 1920×900. Additional presets: 1366×600, 1536×700, and 2560×1280 when the affected flow needs them. Heights are test budgets. Do not subtract browser chrome or use DPR to imitate operating-system scaling. Set viewport before navigation. Use DPR 1 unless the real test requires another declared value.

Check B−1, B, and B+1 for each applicable actual breakpoint or container threshold. Check horizontal scrolling below desktop minimum and actual popup bounds separately. Operate modal and footer controls through their real scroll owners at short heights. Check Russian, English, expansion stress, and text zoom. Viewport reduction does not prove text-zoom behavior.

Inspect settled visible-area screenshots and every reachable changed state. Code inspection alone is not rendered proof.
