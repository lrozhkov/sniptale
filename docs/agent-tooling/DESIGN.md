# Sniptale product design contract

This document owns UX, accessibility, theme, and interaction requirements for extension interfaces. `@sniptale/ui/styles/design-tokens` owns token values. `@sniptale/ui` owns shared components and interaction primitives.

## Ownership

- Use an existing `@sniptale/ui` primitive when it provides the required behavior.
- Keep feature-specific UI in its feature or runtime. Put reusable visual or interaction behavior in `packages/ui`.
- Build content-script UI with the established Shadow DOM, portal, focus, and event-listener owners. Do not depend on host-page CSS or DOM structure.
- Route product text through the app i18n owners.
- Give an icon an accessible name when it is the only label for an action or status. Hide it from assistive technology when adjacent text provides that label.

## Theme and tokens

- In light and dark themes, verify each visual component's text, surfaces, borders, controls, overlays, focus indicators, disabled states, and feedback.
- Apply theme state at the runtime root. Pass that state to portals and detached roots through shared theme helpers.
- Do not infer extension theme state from the browser or host page.
- Use semantic tokens for color, typography, spacing, radius, elevation, and motion.
- Do not copy token values into documentation or feature-local constants.
- Use accent color only for selection, primary actions, and active editing.
- Pair color with text, an icon, or shape for status, errors, destructive actions, and keyboard focus.

## Layout

- Identify each screen's primary task with its title and primary action when that action exists.
- Keep the title, current selection, primary action, and blocking status visible throughout the width and height range declared by the runtime owner.
- Group controls by the state they change.
- Put only actions for the inspected or selected object in its inspector or floating toolbar.
- Separate destructive actions from routine actions by both spacing and visual treatment.
- Constrain every scrollable region through its owning layout container.
- Use nested scrolling only when each region serves a separate task and has its own keyboard path.
- Keep floating UI inside the visual viewport.
- Recompute floating placement after the viewport, anchor, or floating element changes size or position.
- Do not cover the anchor or edited object when another in-viewport placement is available.

## Interaction

- Give each popover, menu, dialog, drag, resize, and drawing mode one state owner.
- That owner handles activation, dismissal, cleanup, pointer capture, `Escape`, and focus restoration.
- When keyboard and pointer input are both supported, route them to the same state transition.
- Disabled controls must ignore keyboard and pointer activation.
- `Escape` closes only the highest active dismissible layer.
- Closing a transient layer restores focus to its existing trigger.
- Closing a modal or temporary editing mode also restores the previous interaction mode and suspended shortcuts.
- Route outside-click dismissal through the shared floating-interaction owner, including across portals and Shadow DOM boundaries.
- A selection-commit click must not activate or dismiss the surface behind the active layer.
- While an asynchronous action is pending, show progress or a busy state, reject duplicate submission, surface failure, and preserve recoverable input.

## Accessibility

- Make every control keyboard reachable and operable in DOM order unless the shared component defines another order.
- Use a native control when it provides the required behavior.
- Use the matching shared component for dialogs, menus, listboxes, tabs, and toolbars. Do not recreate its ARIA or keyboard contract.
- When no shared component exists, implement the native keyboard and ARIA contract for the custom composite.
- Keep keyboard focus visible.
- Meet WCAG 2.2 AA contrast for text, icons, focus indicators, and state distinctions against their rendered backgrounds.
- Trap focus inside an open dialog, expose its title, and restore focus when it closes.
- Place a validation error next to its control and expose it to assistive technology.
- Do not communicate an error only through color, position, animation, a tooltip, or an icon.
- Respect reduced-motion preferences. State changes must remain understandable with nonessential animation disabled.

## State and feedback

- For a changed interactive component, verify each reachable state among default, hover, focus-visible, active, selected, disabled, loading, and error.
- For a changed data view, verify each reachable state among loading, empty, unavailable, and error.
- Do not use selection state as a saved-state indicator.
- A persistent edit distinguishes unsaved, saving, and failed states. Show a saved state when the committed result is not otherwise visible.
- Require confirmation before an irreversible action.
- For a reversible destructive action, provide undo that restores the previous visible and persisted state, or require confirmation.
- State what failed and the next available action.
- Do not expose raw exceptions, internal identifiers, secrets, or retained page content in user-facing feedback.

## Responsive and embedded contexts

- Verify each interface at the minimum width and height declared by its runtime owner.
- Keep primary and recovery actions available under text zoom and at the minimum dimensions.
- Host-page UI must not depend on the host background color, browser zoom, stacking context, or scroll position.
- After any change to those values, host-page UI must retain contrast, placement, and input ownership.
