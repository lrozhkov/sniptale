# Displayed properties and related objects

[Working example](../../tooling/design-reference/examples/properties/index.html) · [Foundations](foundations.md)

## Choose by meaning

| Meaning | Presentation | Interaction |
| --- | --- | --- |
| Informational value | Plain name/value row | None |
| Identifier or technical value that needs copying | Plain value and adjacent Copy action | Copy preserves the value |
| Editable value temporarily unavailable | Existing field with explicit reason | Follow [Fields](fields.md) |
| Related object that can open | Navigation row with object name and navigation icon | Open the declared destination |
| Operation on the current object | Command | Follow [Buttons](buttons.md) |

Static properties have no disabled-input styling, input surface, caret, dropdown arrow, or hover frame. Valid information stays readable without unavailable dimming. Property sets use definition lists. Names stay secondary, values primary, both 13px/18px regular. Structural headings retain their separate role. Value presence/importance never increases label or value weight.

## Geometry and text

Use 28px minimum read-only rows with 4px separation. Interactive parameter rows retain their separate control and target geometry. Keep a consistent trailing value column within the group. Align single-line text baselines. Align wrapped names and values to their first lines. Use 8px between name and value. Do not add a border around each property. Short dimensions, durations, sizes, and dates align to the trailing edge.

Long descriptions wrap. Identifiers can break at safe character boundaries when necessary. Use tabular numerals for comparable numbers. Format dates, units, and numbers through locale owners. Do not use monospace for ordinary names, dates, or sizes.

Static values wrap without tooltips or extra Tab stops. Bounded rows follow [text fitting](localization.md). Retain padding before trailing actions without text beneath their targets. Missing values use localized absence labels, such as Not available, never zero.

Keep a duration row for time-based media when its value is not yet available. Display an absence marker instead of zero.

For filename editing, keep the immutable extension outside the editable stem. Pass the complete filename to the existing save owner. Empty input must not save an extension alone. Project names retain their ordinary text contract, including dots.

## Supplemental groups

Keep provenance inside the existing Properties disclosure when it describes the same object. Do not add a second Source disclosure for those properties. Put separate related-object lists in compact information disclosures. Start them closed for each selected object. Keep padding and a trailing chevron on the summary. A small neutral icon identifies informational content. Follow [Navigation](navigation.md) for disclosure geometry.

Defer a related-object lookup when only the collapsed group consumes its result. Closing the group or changing objects must prevent stale results. Preserve the existing invalidation, retry, and navigation owners. Keep loading, error, and empty content inside the body. These states must not resize the summary. Do not defer data required by another visible consumer.

## Copyable values

Diagnostic journals and other records for manual copying use an explicit selectable-content region. Permit native browser selection throughout that region, including descendant text elements. Keep surrounding commands outside it. Do not require export or a Copy command for ordinary text selection.

Interface labels and hints remain outside mouse text selection. An explicit Copy command provides the full technical value without introducing a text caret across the row. Copy actions use the utility icon treatment: brighten the icon on hover, without a new filled surface or frame. Give the action a specific accessible name, such as Copy source identifier.

Keep its target at least 24px. Keep focus on the command after copying. Report success without changing the property text or accessible action name. A clipboard failure retains the value and provides a visible retry instruction. A genuinely editable or intentionally selectable text field follows its own input contract.

## Related objects

Related-project rows navigate without selecting projects or changing properties. URLs use real links, preserving modified-click, new-tab, keyboard, and browser behavior. Extension-API navigation retains the existing command owner. Related-object lists use one consistent navigation icon, without checkboxes or dropdown chevrons.

A neutral row can brighten its text on hover. Keep adjacent rows visually separate with 4px spacing. User-authored object names in compact navigation buttons occupy one line. Truncate excess text at the trailing edge with an ellipsis. Keep the full stored and accessible name. Use the native browser title to expose the complete name on hover. Plain informational names can wrap. Loading, failure, empty results, and unavailable references have distinct readable states. An unavailable reference displays its name and reason as plain content. Do not display a working-looking navigation target.

## Existing consumers

The library preview's PreviewMetadataCards and PreviewProjectUsage establish the informational and navigation roles. Product acquisition, usage lookup, navigation, and clipboard permissions remain with their existing owners.
