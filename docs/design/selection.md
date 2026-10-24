# Selection controls

[Working example](../../tooling/design-reference/examples/selection/index.html) · [Foundations](foundations.md)

## Choose semantics, then placement

| Intent | Control | Example |
| --- | --- | --- |
| Enable an independent function without separate confirmation | Toggle switch | Autosave, FPS, immediate inspector effect |
| Select independent items, conditions, or operation contents | Checkbox | Export contents, filters, next recording sources |
| Choose exactly one value in a named group | Radio | Effect mode |
| Execute work once | [Command](buttons.md) | Record, export, apply |

Checkboxes can represent single items. Immediate filtering remains selection. Immediate true/false parameters use switches, never enabled/disabled dropdowns. Live previews preserve form Save/Cancel contracts.

Switches support immediate project edits with Undo or persistent defaults. Source-inclusion checkboxes describe upcoming operations, not current operation. Recording microphone commands/switches expose their current action/state. Persistent processing settings with live tests use switches without Save.

Mixed multiple-object booleans use trailing indeterminate native checkboxes, never switches. Retain controls across object selection changes. Selecting mixed values applies enabled through the existing edit owner.

Keep accepted configuration, pending application, rejected constraints, and unsupported capabilities distinct. Status dots and current-step markers are not radio controls.

| Layout | Placement and text |
| --- | --- |
| Object, filter, or condition selection list | Control before the item label |
| Parameter editor | Secondary name left, control in the trailing value column |
| Deferred form parameter | Trailing checkbox, existing confirmation retained |
| Immediate boolean parameter | Trailing switch |

Use Checkbox layout=parameter for deferred parameter rows. Do not make the name bold or primary when checked. The control communicates the value. Align the circle with the first text line when a label wraps. Do not center it against a multiline description. Associate the visible label with its control. Preserve native checkbox activation and switch keyboard access.

## Drawing and states

The default prototype uses an 18px disc, the shared orange vector check, and an optically centered radio dot. The 16px and 20px specimens demonstrate density variants, not alternative defaults. Consumers must not redraw checks or radio dots. Keep aspect ratios, centers, and stroke widths stable. A switch uses a pale thumb, thin track, and position plus accent to indicate its enabled state.

Center the switch thumb and track within the actual target height. Do not retain fixed vertical offsets when density changes.

Keep the small neutral glow: near white in dark theme, dark in light theme. Do not restore orange glow. The 28px checkbox target and switch target are independent of drawing size. Preserve disabled checked values. Unavailable does not mean off. Use empty/check/dash for the parent selection scope. Individual items show only their own selection.

Name the scope of Select all. Keep parent state synchronized with available children.

When dependencies require a selected entry, show it checked and disabled. Derive this state from the existing selection owner. Include required descendants and restore activation when the dependency ends. Keep branch navigation available. Apply disabled dimming once. Do not multiply row and control opacity.

## Acceptance and recovery

A switch without separate confirmation can wait for asynchronous persistence. While pending, prevent duplicate changes and expose progress. Failure retains the accepted state and offers retry. Do not steal focus if the user moved elsewhere. Checkbox form drafts remain separate from accepted values. Radio groups keep one selection and a coherent keyboard route through available options.

Use [Choices](choices-and-surfaces.md) for segments or dropdown representations of an exclusive property.

## Integration references

Use existing product control owners and preserve their state contracts. The compact line presentation uses `ProductGlassSwitch` with `sniptale-compact-switch` outside an inspector. It shares the inspector switch drawing and retains its own keyboard target. Settings and automatic blur use the accepted circular checkbox drawing. Other flows retain their current drawing unless the user approves a replacement. [WAI checkbox](https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/), [radio](https://www.w3.org/WAI/ARIA/apg/patterns/radio/),

[switch](https://www.w3.org/WAI/ARIA/apg/patterns/switch/).

## Neutral filter proposal

Use [Selection filter variants](selection-filters.md) for these rules.
