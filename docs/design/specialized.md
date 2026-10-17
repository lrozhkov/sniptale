# Specialized mechanics

[Working example](../../tooling/design-reference/examples/specialized/index.html) · [Foundations](foundations.md)

[Surface-specific patterns](surfaces.md) limit generic rules for popup, timeline, canvas, and embedded UI.
## Preserve the useful interaction

Standardize surrounding labels, values, icons, focus, surfaces, and feedback. Do not replace a timeline, canvas gesture, color plane, scrub control, or docking interaction with a generic field for visual consistency. The examples provide bounded probes. They do not implement media decoding, real playback, production history, capture permissions, or native eyedropper parity.

| Mechanic | Preserve |
| --- | --- |
| Timeline seek and playhead | Time mapping, playback state, selection, scroll ownership |
| Clip trim/resize | Valid boundaries, snapping, preview, commit, cancellation, capture |
| Lane selection | Selection meaning, modifiers, context commands, focus |
| Canvas pan/zoom/crop/resize | Coordinate mapping, zoom context, tool, bounds, recovery |
| Numeric scrub and stepper | Units, precision, domain limits, repeat and acceptance |
| Color plane and eyedropper | Color model, alpha, format, draft and browser-session ownership |
| Inspector docking/resize | Scroll owners, category rail, intermediate layouts, reachability |
| Dense trees and structured data selection | Row rhythm, disclosure glyphs, checkbox drawings, indentation, column selection and inner scrolling |

Before implementation, record the trigger, state owner, preview, acceptance, cancellation, failure, and supported limits for the affected mechanic. Map a real consumer and evidence to each claimed invariant. Preserve supported keyboard alternatives and pointer capture. Do not invent shortcuts or change domain mappings during styling.

## Dense trees and structured data

Apply interface font and color roles to the existing compact controls. Preserve the local row rhythm, disclosure geometry, checkbox drawings and alignment. Ordinary command targets and inspector disclosure headers do not define this geometry. Do not replace specialized controls with generic components for appearance alone.

Compare a complete expanded tree before and after a change. Check single-line and multiline rows, nested groups, checked and unchecked drawings, column controls and keyboard focus. Check filtering, partial selection, expansion and actual scroll owners separately from surrounding dialog commands.

## Shared gesture contract

Keep accepted state separate from a live preview. A valid release commits once. Cancel, Escape, lost capture, window blur, and supported operating-system interruption clear active feedback and preserve accepted data. Keep handles recognizable at supported zoom. Active dragging remains visible after the pointer leaves the original hit region. Do not apply command-button displacement to drag handles.

Preserve independent gesture surfaces and actual scroll owners. Avoid changes that swallow page scrolling. Physical touch and operating-system interruption require integration proof beyond synthetic events.

The active playback range supplies two temporary snap targets. Project these targets into each lane's time axis. Keep codec-valid source boundaries separate from ordinary magnets. Preserve Alt bypass for ordinary magnets. Keep the time readout outside the pointer drawing and inside the visible timeline.

## Numeric variants

Some properties allow a wider typed domain than their contextual scrub range. Declare typed bounds and scrub bounds separately. A valid typed value outside scrub bounds remains accepted. Show an explicit out-of-range indication instead of silently clamping the typed value or implying an exact thumb position. The next deliberate range edit can choose a value within the scrub domain.

Some device settings expose a slider and read-only value. Preserve that range-only contract rather than adding direct numeric editing during visual alignment. The shared [Numbers](numbers.md) owner defines the actual variants.

## Property expressions

A property editor can accept expressions, keywords, and units. Keep complete text entry and the existing parser and recovery owner. A numeric current value does not justify a control that accepts only numbers. A field for these values can remain stacked and use the available width. The [design review fields](../../apps/extension/src/content/overlay/design-review/settings/numeric-field.tsx) preserve this text contract.

## Product references

Preserve existing crop, timeline, media, and inspector owners rather than copying the probes into product state. The complete color/paint selector remains authoritative in apps/extension/src/ui/color-selector/index.tsx and its existing shared packages. Read about the sample color transaction in [Layers](layers.md). Review [Coverage](coverage.md) before using these examples as a complete screen implementation reference.
