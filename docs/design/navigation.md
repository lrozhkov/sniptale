# Navigation and disclosure

[Working example](../../tooling/design-reference/examples/navigation/index.html) · [Foundations](foundations.md)

## Choose by destination

Use tabs for associated content panels, navigation links for destinations, and disclosure for expanding a group. Use [Choices](choices-and-surfaces.md) for one property value. A switch enables a feature, not a panel. Docking and panel-height changes are quiet utility commands with their existing owners. Keep destination, expansion, selection, hover, and keyboard focus distinct.

Preserve location, selected object, valid drafts, and scroll through the actual navigation contract.

## Tabs and category rails

Connect true tabs with their panels. Use one Tab stop and arrows in the declared orientation, plus Home/End. Automatic activation is appropriate when panels appear without noticeable delay. Otherwise require explicit activation. Do not assign tab semantics to route links or category filters without a tab-panel relationship. Categories change on click or keyboard activation, never hover alone.

Underline-style text tabs brighten on hover without a filled surface. The selected line remains separate from keyboard focus. Category rails can retain their declared selected surface. Keep insets and icon alignment stable.

An inspector can represent the same sections through categories or an All view with disclosure groups. Switch presentation without losing parameter values or remembered section state. Keep category selection and disclosure preferences separate from project data and Undo. Derive columns from available content width, including the rail and group insets, rather than from the page width alone.

Horizontal tabs stay on one line and scroll within their navigation owner when needed. Do not wrap tabs into several rows or convert navigation into a parameter dropdown without a separate navigation decision. Vertical rails keep one-line names. Truncated names retain full accessible labels and full text on hover and keyboard focus.

## Shared disclosure

Use the shared inspector disclosure presentation. Native details/summary are valid primitives. Do not expose browser-default triangles or invent a separate spoiler owner for helper notes. The shared full-size chevron sits at the trailing edge and folds upward while open. Keep 8px horizontal header insets, 32px minimum height, and body text aligned with the header text.

Keep an 8px body inset below the complete header target before the first control, including nested groups. Do not remove it when the first control inherits the group name. Structural headings use the shared 14px/20px weight 600 role. Nested group headings use 13px/18px at weight 500 and a 14px chevron. Keep their target at least 32px high, retain 8px edge insets, and avoid repeated section dividers.

Expansion does not enable the feature. Avoid redundant wrappers around a single ordinary parameter. Header text remains unselectable. Preserve pointer, Enter, Space, and keyboard focus. Remember expansion by editor, semantic type, and stable group ID, not translated labels or transient object identity. Keep the target reachable after expansion and collapse.

## Optional information

Use the information disclosure variant for optional explanations, sample notes, or contextual help. Keep essential instructions visible. Do not use it for commands, warnings, errors, or editable parameter groups. Its 16px outline information icon precedes the 13px/18px weight 500 label with a 6px gap. Retain 8px edge insets. Align body prose with the label, 30px from the header edge.

The resting foreground is secondary. Hover brightens it without a background, border, or orange accent. The information icon remains fixed while only the trailing chevron changes. Keep content optional and independent of a feature's enabled state.

## Integration references

Existing owners include categorized-inspector, inspector-shell, compact-inspector-controls/disclosure, and settings subpage-tabs. Do not replace specialized section-switching state or product preference ownership with sample session storage. Check both presentations, nested groups, long labels, keyboard order, and short-height scroll owners. [WAI tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/),

[disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/).

Preserve an established vertical icon rail when the same inspector switches to grouped navigation. Place it beside the actual content scroll owner. Keep it vertical at narrow widths and give the rail its own overflow when necessary. Keep its icons, accessible names, current-category state, keyboard route, and remembered selection. Do not turn it into wrapping text buttons as part of a style-only change.

Keep subtle horizontal dividers between major inspector groups when the existing surface uses them. Do not repeat these dividers at each nested group.
