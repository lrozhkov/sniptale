# Buttons and commands

[Working example](../../tooling/design-reference/examples/buttons/index.html) · [Foundations](foundations.md)

## Select the family

| Intent | Presentation | Persistent state |
| --- | --- | --- |
| Primary task command | Neutral fill, content width | None |
| Secondary command | Quiet, neutral hover surface | None |
| Command over variable imagery | Opaque backing and one thin neutral boundary | None |
| Undo, Redo, Close, Clear | Chrome icon, brighter on hover, no fill or visible border | None |
| Dense state indicator | Small icon with existing color feedback, no fill or border | Domain state |
| Independent icon-only toolbar mode | Transparent tool | Orange icon, subtle boundary, pressed state |
| One exclusive icon-only tool | Transparent radio tool | Orange icon and subtle boundary |
| Exclusive tool with text | Labeled radio choice | Neutral selected fill, primary text |
| Choose a property | [Choice owner](choices-and-surfaces.md) | Accepted value |
| Open commands | Menu trigger | Expanded state |
| Navigate or disclose | [Navigation owner](navigation.md) | Destination or expansion |

Use a form-owned submit button to submit a draft. Independent pressed modes retain stable names. Changing Start/Stop commands remain commands, not pressed modes. Use one primary command per clear task region. Full width needs a layout reason. Ordinary commands never use orange fill or orange text. Danger tone is a semantic exception with its own contrast proof.

Do not mix borders among equivalent neighboring commands without a surface reason. Choose text and icon content through the [command decision table](command-content.md), not consumer preference. Icon-only actions require complete accessible names. Use native browser `title` for optional hints. Do not add custom tooltip layers. Keep required explanations visible.

Use 16px icons, 6px icon/text gaps, 10px compact horizontal padding, and the shared label weight. Preserve established 14px or 16px geometry on specialized surfaces. Labeled controls coordinate text weights 400/450/500 with Lucide strokes 1.75/1.875/2. Do not apply stroke overrides to filled logos.

## Toolbar and disclosure

Inactive icon-only tools brighten their icon and show a faint neutral hover boundary, mixed at 28% secondary foreground. Specialized injected icon tools retain no fill, an orange icon, and a 1px accent boundary mixed at 35%, rising to 55% on hover. Labeled panel tools use weight 400 at rest, 450 on hover, and 500 when selected. Selection adds a soft neutral fill. Hover adds no border. Keyboard focus remains visible. An icon row that selects a presentation remains a property choice. Its accepted value uses neutral selection, even when it resembles a toolbar. Do not add checks merely to indicate toolbar selection. Use radio for exclusive tools and aria-pressed for independent modes. Programmatic state needs a visible non-hue alternative.

Physical pressure, selection, expansion, and focus remain independent. Use one toolbar Tab stop with arrow/Home/End focus movement. Moving focus does not activate a mode.

| Disclosure | Indicator |
| --- | --- |
| Property dropdown or named command menu | Full down chevron, folded upward while open |
| Additional toolbar controls | 6×4px down triangle, 4px from right/bottom edges |
| Side or nested menu | Side chevron, preserving hierarchy when placement flips |
| Recognizable Add or More menu | Plus or overflow icon without a redundant chevron |

Only real disclosure triggers get an indicator. The small toolbar triangle remains downward while open. The entire trigger activates. Opening a toolbar panel does not enable its tool. A mode and its property picker remain two controls. A true split command needs a default action plus alternative commands. Command menus share [Choices](choices-and-surfaces.md) spacing and [Layers](layers.md) dismissal.

Enter/Space open menus. ArrowDown/ArrowUp can enter at the first/last available item.

## Full press cycle

Pointer down shows pressure without executing. Hold retains feedback without repeating. Leaving clears pressure. Release outside does not execute. Returning while held restores native release-inside behavior. Release inside executes once. A canceled pointer press must not execute on later release. Disabled or pending commands cannot activate or show new pressure. Cancellation, lost capture, native dialogs, and window blur clear pressure.

Space executes on release. Escape cancels an armed Space. Enter executes once per physical press without key-repeat execution. Do not use aria-pressed for temporary physical pressure. Keep targets fixed. Move only content by 1px, with proposed 55ms down and 110ms release feedback. Do not wait for animation before executing. Reduced motion removes displacement, retaining visible pressure.

An established workspace shortcut can own a key before a focused command. Preserve this key routing. Apply the native command cycle only when the command receives the key. Open widgets and text editing retain their existing key owners.

Do not add ripple, bounce, hover lift, or ordinary command repeat. Numeric steppers retain their own repeat owner.

## Pending and destructive actions

Pending work prevents duplicates and exposes progress. Failure retains input and provides retry. Preserve logical focus after removal or unavailability without stealing it after the user moved elsewhere. Irreversible actions require confirmation starting on Cancel. Reversible deletion provides Undo or confirmation. Native file dialogs retain their platform lifecycle.

[WAI buttons](https://www.w3.org/WAI/ARIA/apg/patterns/button/), [menu buttons](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/).

Dense state indicators remain a distinct presentation. Preserve their compact icon and target sizes, existing status colors, and transparent surfaces in every state. Do not apply full toolbar selection fills to these controls. Enabled and suppressed states follow the owning domain, not a generic pressed-color rule. Preserve keyboard focus independently.
