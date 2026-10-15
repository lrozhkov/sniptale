# Surface-specific patterns

[Design index](index.md)

## Apply the correct authority first

Identify the runtime and surface before selecting a control presentation. An explicit surface-specific pattern takes priority over a generic specimen. Common rules apply only where the control has equivalent meaning, context, and interaction. If equivalence is unclear, inspect the existing surface owner and record the unresolved difference.

Do not silently force a generic control into a specialized surface.

| Surface | Preserve first | Transfer conditionally |
| --- | --- | --- |
| Desktop parameter inspector | Shared parameter rows and established editor contracts | Ordinary control geometry and hierarchy |
| Extension popup | Existing popup controls, density, panel sizing, curtains, triggers, navigation | Shared semantics, readable states, focus and recovery |
| Timeline | Time scale, lanes, handles, playhead, selection, snapping, scrolling | Surrounding commands and parameter fields when equivalent |
| Canvas and crop | Coordinate mapping, zoom, gestures, tools, bounds | Shared chrome around the specialized interaction |
| Embedded content UI | Shadow DOM, theme propagation, viewport and input owners | Applicable shared styles through existing runtime adapters |

## Extension popup

Popup is a specific product surface, not a narrow version of the desktop inspector. Inspect its existing controls and nearby flows before changing a component. Do not automatically impose desktop row heights, field widths, radii, spacing, disclosure hierarchy, or panel navigation. Preserve InlineCurtainSelect, primary/secondary triggers, back navigation, device feedback, and recording state ownership.

Use existing popup tokens and components. A missing mapping requires an explicit surface decision before implementation. The curtain specimen demonstrates state and focus behavior. It is not a faithful visual replacement for the product popup.

Relevant source owners include apps/extension/src/ui/popup-shell and apps/extension/src/popup/recording. The recording setup and settings layouts define their own minimum dimensions.

## Timeline and other specialized UI

Timeline lanes and handles are not ordinary list rows or generic sliders. Selection can mean clip, lane, range, playhead, or active tool. Preserve that distinction. Keep time labels, ruler density, hit targets, zoom mapping, snapping, drag capture, preview, commit, cancel, and Undo contracts. Do not apply compact parameter typography, row spacing, or command pressure animations blindly to these elements.

Use [Specialized mechanics](specialized.md) to record local invariants and supported keyboard alternatives. A generic gesture probe does not establish a new timeline visual specification.

## Resolve a conflict

1. Identify the actual surface owner and supported flow.
2. Locate its existing nearby control and state contract.
3. Apply only compatible common rules.
4. Record a necessary exception with its source and reason.
5. Request a concrete design decision when neither the local pattern nor this package resolves the difference.

Accessibility, readable feedback, disabled-state integrity, and recoverable data remain requirements across surfaces. Their concrete presentation must respect the runtime and existing specialized interaction.
