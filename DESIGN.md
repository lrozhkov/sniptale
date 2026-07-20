# Sniptale product design contract

This document defines reviewable UX, accessibility, theme, and interaction requirements for extension-owned interfaces. Exact token values are code-owned by `@sniptale/ui/styles/design-tokens`; shared components and interaction primitives are exported by `@sniptale/ui`.

## Ownership

Reuse an existing `@sniptale/ui` primitive before adding an app-local equivalent. App-local UI belongs to the feature or runtime that owns its behavior, while reusable visual or interaction behavior belongs in `packages/ui`.

Content-script interfaces must remain isolated from host-page CSS and DOM assumptions. Their portals, floating layers, focus handling, and event listeners must use the content runtime's established Shadow DOM owners.

Product text must use the app i18n owners. Icons need an accessible name when they communicate meaning and must be hidden from assistive technology when adjacent text already supplies that meaning.

## Theme and tokens

Light and dark themes are equal product modes. A component is complete only when its text, surfaces, borders, controls, overlays, focus indication, disabled state, and feedback remain legible in both.

Apply theme state at the established runtime root. Portals and detached overlay roots must receive the same theme through the shared theme helpers instead of inferring it from browser or host-page state.

Use semantic design tokens for color, typography, spacing, radius, elevation, and motion. Do not copy token values into documentation or introduce feature-local constants for a semantic role already owned by the design system.

Accent color identifies selection, primary action, or active editing state. It must not be the only signal for status, error, destructive action, or keyboard focus.

## Layout and hierarchy

Every screen must expose one clear primary task. Primary action, title, current selection, and blocking status must remain visible at the viewport sizes the owning runtime supports.

Group controls by the state they change. Keep unrelated actions out of inspectors and floating toolbars, and keep destructive actions visually and spatially distinct from routine editing actions.

Scrollable regions need an explicit size owner. Avoid nested scrolling unless each scroll region has an independent task and keyboard path.

Floating UI must stay inside the usable viewport, recompute placement after relevant size or anchor changes, and avoid covering the object being directly manipulated when another valid placement exists.

## Interaction ownership

Each open popover, menu, dialog, drag, resize, or drawing mode has one owner for activation, dismissal, and cleanup. Do not split pointer capture, Escape handling, or focus restoration across unrelated components.

Keyboard and pointer actions must produce the same state transition where both interactions are applicable. Disabled controls must not respond to either path.

Escape closes only the highest active dismissible layer. Closing a transient layer restores focus to its trigger when the trigger still exists. Closing a modal or temporary editing mode also restores the underlying interaction mode and any suspended shortcuts.

Outside-click dismissal must use the shared floating-interaction owners and account for portals or Shadow DOM boundaries. A click that commits a selection must not also dismiss or activate the surface behind it.

Long-running actions expose progress or a stable busy state, prevent accidental duplicate submission, and surface failure without discarding recoverable user input.

## Accessibility

All interactive controls must be reachable and operable by keyboard in a logical order. Use native controls when they express the required behavior; custom composites must implement the corresponding keyboard and ARIA contract.

Focus must always be visible for keyboard navigation. Focus indicators, text, icons, and required state distinctions must meet WCAG 2.2 AA contrast requirements against their rendered backgrounds.

Dialogs trap focus while open, identify their title, and restore focus on close. Menus, listboxes, tab sets, and toolbars must use the matching shared component behavior rather than ad hoc roles.

Communicate validation errors next to the affected control and in a form that assistive technology can announce. Do not rely on color, position, animation, or tooltip-only text to explain an error.

Respect reduced-motion preferences. Functional state changes must remain understandable with nonessential animation disabled.

## State and feedback

Review each interactive component in its default, hover, focus-visible, active or selected, disabled, loading, and error states as applicable. Data views also require intentional empty and unavailable states.

Selection and saved state are different signals. A control that changes persistent state must distinguish an unsaved edit, an in-progress save, a successful commit when confirmation is needed, and a failed commit.

Destructive or irreversible actions require confirmation proportional to their impact. Undo is preferred when the operation can be reversed reliably.

Errors state what failed and the next available action. Do not expose raw exceptions, internal identifiers, secrets, or retained page content in user-facing feedback.

## Responsive and embedded contexts

Interfaces must work at the minimum supported dimensions of their owning extension page or overlay and remain usable under text zoom. Do not hide the only route to a primary or recovery action at narrow widths.

Host-page overlays must tolerate arbitrary page backgrounds, zoom, stacking contexts, and page scrolling without losing contrast, placement, or input ownership.

## Acceptance checks

- Shared tokens, components, theme helpers, and floating-interaction owners are used where applicable.
- Light and dark themes, minimum supported dimensions, text zoom, and reduced motion are verified.
- Keyboard order, focus visibility, Escape behavior, dismissal, and focus restoration are verified.
- Loading, empty, disabled, duplicate-action, success, and failure behavior match the owning state contract.
- Product text is translated and meaningful icons have an accessible name.
- Host-page surfaces remain isolated and usable across Shadow DOM, portal, scroll, zoom, and stacking boundaries.
