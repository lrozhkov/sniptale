# Selection controls

[Working example](../../tooling/design-reference/examples/selection/index.html) · [Foundations](foundations.md)

## Choose semantics, then placement

| Intent | Control | Example |
| --- | --- | --- |
| Enable an independent function without separate confirmation | Toggle switch | Autosave, FPS, immediate inspector effect |
| Select independent items, conditions, or operation contents | Checkbox | Export contents, filters, next recording sources |
| Choose exactly one value in a named group | Radio | Effect mode |
| Execute work once | [Command](buttons.md) | Record, export, apply |

A checkbox can represent one item, not only batch actions. Immediate filter updates do not turn selection into a switch. An immediately applied true/false parameter uses a switch, rather than a dropdown containing enabled and disabled. A live preview does not remove a form's Save/Cancel contract.

Switches can apply immediate project edits with Undo or persistent defaults for future operations. A checkbox can include a source in one upcoming operation without implying that the source currently operates. During recording, a microphone command or switch must expose its actual current action and state. A persistent processing setting with a live test uses a switch when no Save applies.

A multiple-object boolean editor can contain different values. Use a trailing indeterminate native checkbox for mixed boolean values. A switch cannot represent mixed values. Keep the control when selected objects change. Selecting a mixed checkbox applies the enabled value through the existing edit owner.

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

Use existing product control owners and preserve their state contracts. The compact line presentation uses `ProductGlassSwitch` with `sniptale-compact-switch` outside an inspector. It shares the inspector switch drawing and retains its own keyboard target. The sample's circular checkbox remains a proposal pending final visual acceptance. [WAI checkbox](https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/), [radio](https://www.w3.org/WAI/ARIA/apg/patterns/radio/),

[switch](https://www.w3.org/WAI/ARIA/apg/patterns/switch/).

## Neutral filter proposal

The neutral filter specimen uses the shared circle with a gray unchecked surface and theme-inverted selected surface/check. It removes orange from this filter variant only. The default parameter checkbox remains unchanged. Filter labels can brighten on hover and use weight 600 when selected. Reserve that width so selection does not move counts or neighbors. Align the disc, first label line, and count centers. Keep counts in a fixed trailing column when labels wrap.

This exception applies to category/facet selection, not parameter names. Parameter names remain secondary at weight 400. GalleryFacetOptionRow uses neutral rounded-square checkboxes. Preserve that product shape until a separate decision approves a replacement. The neutral circular filter specimen is a new proposal, not an approved global change.

Compact inspector booleans occupy the first 32px band of 40px rows. Reserve the lower 8px contextual strip across equivalent parameters. Keep 4px between rows. Named boolean toggles retain their declared action. This variant does not change ordinary form or collection geometry.
