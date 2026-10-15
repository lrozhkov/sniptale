# Selection controls

[Working example](../../tooling/design-reference/examples/selection/index.html) · [Foundations](foundations.md)

## Choose semantics, then placement

| Intent | Control | Example |
| --- | --- | --- |
| Enable an independent function without separate confirmation | Toggle switch | Autosave, FPS, immediate inspector effect |
| Select independent items, conditions, or operation contents | Checkbox | Export contents, filters, next recording sources |
| Choose exactly one value in a named group | Radio | Effect mode |
| Execute work once | [Command](buttons.md) | Record, export, apply |

A single checkbox is valid. Checkbox does not mean batch action. Immediate filter updates do not turn selection into a switch. An immediately applied true/false parameter uses a switch, rather than a dropdown containing enabled and disabled. A live preview does not remove a form's Save/Cancel contract.

A switch can accept an immediate project edit with Undo or a persistent default for future operations. A checkbox can include a source in one upcoming operation without implying that the source currently operates. During recording, a microphone command or switch must expose its actual current action and state. A persistent processing setting with a live test uses a switch when no Save applies.

A multiple-object boolean editor can contain different values. Use a trailing native checkbox with its indeterminate state when this editor must represent mixed values. A switch cannot represent mixed values. Keep the same control while the selected objects change. Selecting a mixed checkbox applies the enabled value through the existing edit owner.

Keep accepted configuration, pending application, rejected constraints, and unsupported capabilities distinct. Status dots and current-step markers are not radio controls.

| Layout | Placement and text |
| --- | --- |
| Object, filter, or condition selection list | Control before the item label |
| Parameter editor | Secondary name left, control in the trailing value column |
| Deferred form parameter | Trailing checkbox, existing confirmation retained |
| Immediate boolean parameter | Trailing switch |

Use Checkbox layout=parameter for deferred parameter rows. Do not make the name bold or primary when checked. The control communicates the value. Align the circle with the first text line when a label wraps. Do not center it against a multiline description. Associate the visible label with its control. Preserve native checkbox activation and switch keyboard access.

## Drawing and states

The default prototype uses an 18px disc, the shared orange vector check, and an optically centered radio dot. Explicit 16px and 20px specimens demonstrate density changes. They are not competing default designs. Do not redraw the check or radio dot inside consumers. Keep aspect ratios, centers, and stroke widths stable. A switch uses a pale thumb, thin track, and position plus accent to indicate its enabled state.

Keep the small neutral glow: near white in dark theme, dark in light theme. Do not restore orange glow. The 28px checkbox target and switch target are independent of drawing size. Preserve disabled checked values rather than drawing every unavailable control as off. Use empty/check/dash for the parent selection scope. Individual items show only their own selection.

Name the scope of Select all. Keep parent state synchronized with available children.

## Acceptance and recovery

A switch without separate confirmation can wait for asynchronous persistence. While pending, prevent duplicate changes and expose progress. Failure retains the accepted state and offers retry. Do not steal focus if the user moved elsewhere. Checkbox form drafts remain separate from accepted values. Radio groups keep one selection and a coherent keyboard route through available options.

Use [Choices](choices-and-surfaces.md) for segments or dropdown representations of an exclusive property.

## Integration references

Use existing product control owners and preserve their state contracts. The sample's circular checkbox remains a proposal pending final visual acceptance. [WAI checkbox](https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/), [radio](https://www.w3.org/WAI/ARIA/apg/patterns/radio/),

[switch](https://www.w3.org/WAI/ARIA/apg/patterns/switch/).

## Neutral filter proposal

The neutral filter specimen uses the shared circle with a gray unchecked surface and theme-inverted selected surface/check. It removes orange from this filter variant only. The default parameter checkbox remains unchanged. Filter labels can brighten on hover and use weight 600 when selected. Reserve that width so selection does not move counts or neighbors. Align the disc, first label line, and count centers. Keep counts in a fixed trailing column when labels wrap.

This exception applies to category/facet selection, not parameter names. Parameter names remain secondary at weight 500. The library's current GalleryFacetOptionRow uses a neutral rounded-square checkbox. Preserve that product shape until a separate decision approves a replacement. The neutral circular filter specimen is a new proposal, not an approved global change.
