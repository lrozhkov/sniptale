# Sniptale design reference

This document owns product UI rules and their routing. Shared components and surface-specific owners implement these rules. Working examples and these rules define one reference. Expert review does not imply user approval.

## Read only the relevant section

Identify the surface through [Surface-specific patterns](surfaces.md) first. Then read [Foundations](foundations.md) for applicable shared rules. Read [Localization and text fitting](localization.md) whenever an element displays text. Then use the applicable group below. Open its working example and inspect the required state before implementation.

Read [Compositions](compositions.md) when controls share a parameter editor or screen. Read [Layout adaptation](responsive.md) for resizing, compaction, overflow, and target viewports. Read [Runtime boundaries](runtime.md) for shells, portals, embedded UI, and cross-editor rollout. Do not read all sections for a local control change.

Use [Font families](fonts.md) for replacement and installation, [Field accessories](field-accessories.md) for Clear and dictation, and [Parameter layout](parameter-layout.md) for detailed construction. [Command activation](command-press.md) owns the complete press cycle.

| Task | Rules | Working example |
| --- | --- | --- |
| Typography, spacing, radii, contrast, focus | [Foundations](foundations.md) | [Foundations](../../tooling/design-reference/examples/foundations/index.html) |
| Boolean settings, selection, exclusive radio | [Selection](selection.md) | [Selection](../../tooling/design-reference/examples/selection/index.html) |
| Segments, dropdowns, searchable choices | [Choices](choices-and-surfaces.md) | [Choices](../../tooling/design-reference/examples/choices/index.html) |
| Numbers, ranges, steppers, contextual slider | [Numbers](numbers.md) | [Numbers](../../tooling/design-reference/examples/numbers/index.html) |
| Text, search, validation, form drafts | [Fields](fields.md) | [Fields](../../tooling/design-reference/examples/fields/index.html) |
| Static metadata, copyable values, related projects | [Properties](properties.md) | [Properties](../../tooling/design-reference/examples/properties/index.html) |
| Commands, toolbar tools, press cycle | [Buttons](buttons.md) | [Buttons](../../tooling/design-reference/examples/buttons/index.html) |
| Tabs, categories, structural and information disclosure | [Navigation](navigation.md) | [Navigation](../../tooling/design-reference/examples/navigation/index.html) |
| Menus, anchored editors, dialogs, color transaction | [Layers](layers.md) | [Layers](../../tooling/design-reference/examples/layers/index.html) |
| Object rows, cards, filtering, batch actions | [Collections](collections.md) | [Collections](../../tooling/design-reference/examples/collections/index.html) |
| Timeline, trim, canvas, scrub, native handoffs | [Specialized](specialized.md) | [Specialized](../../tooling/design-reference/examples/specialized/index.html) |
| Adjacent controls and real screen patterns | [Compositions](compositions.md) | [Compositions](../../tooling/design-reference/examples/compositions/index.html) |

## Authority and boundaries

- The interface supports work: keep it compact, quiet, readable, and predictable.
- Use existing semantic token and localization owners. Do not promote prototype constants into feature-local tokens or duplicate translated strings.
- Popup, timeline, canvas, and embedded surfaces retain their specific patterns. Do not apply generic geometry without checking equivalence.
- Shared controls own their geometry and interaction. Consumers select explicit semantic variants.
- Parameter names remain secondary. Values and meaningful current states remain primary.
- Ordinary commands are neutral. Orange identifies the declared active tool or selection accent.
- Preserve commit timing, drafts, Undo, focus, persistence, and specialized mechanics during visual alignment.
- Identify the actual product owner and consumers before implementation. Sandbox module topology does not prescribe product topology.
- If a required state lacks a clear rule or example, record the gap. Do not invent a product contract.

## Use and verification

The [catalog](../../tooling/design-reference/index.html) is the only example index. Each group has one page and one rule entry. Entries route focused subtopics without copying rules. The [tool guide](../../tooling/design-reference/README.md) explains local serving and the runtime boundary. [Verification](verification.md) defines the acceptance checks and unproven integration boundaries. [Coverage](coverage.md) maps inspected product surfaces to this reference.

The existing product color selector remains authoritative for its complete picker UI. Circular checkbox geometry, glass tuning, and the thin slider track remain proposed visual decisions pending user acceptance. Do not claim full accessibility compliance from prototype checks.
