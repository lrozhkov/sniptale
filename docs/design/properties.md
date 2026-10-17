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

A static property is not a disabled input. Do not draw an input surface, caret, dropdown arrow, or hover frame around it. Do not dim a valid informational value as if it were unavailable. Use a definition list for a property set. Keep names secondary and values primary at the shared 13px/18px regular weight. Structural section headings use their separate heading role. A present value does not increase weight. A property label does not become bold because the value is important or present.

## Geometry and text

Use 28px minimum read-only rows with 4px separation. Interactive parameter rows retain their separate control and target geometry. Keep a consistent trailing value column within the group. Align single-line text baselines. Align wrapped names and values to their first lines. Use 8px between name and value. Do not add a border around each property. Short dimensions, durations, sizes, and dates align to the trailing edge.

Long descriptions wrap. Identifiers can break at safe character boundaries when necessary. Use tabular numerals for comparable numbers. Format dates, units, and numbers through locale owners. Do not use monospace for ordinary names, dates, or sizes.

Static values wrap by default, so full content stays available without a tooltip or extra Tab stop. Use the [text-fitting policy](localization.md) when a bounded row requires shortening. Retain padding before a trailing action. Text must not extend under its hit target. Do not replace a missing value with zero. Use a localized absence label such as Not available.

Keep a duration row for time-based media when its value is not yet available. Display an absence marker instead of zero.

For filename editing, keep the immutable extension outside the editable stem. Pass the complete filename to the existing save owner. Empty input must not save an extension alone. Project names retain their ordinary text contract, including dots.

## Supplemental groups

Keep provenance inside the existing Properties disclosure when it describes the same object. Do not add a second Source disclosure for those properties. Put separate related-object lists in compact information disclosures. Start them closed for each selected object. Keep padding and a trailing chevron on the summary. A small neutral icon identifies informational content. Follow [Navigation](navigation.md) for disclosure geometry.

Defer a related-object lookup when only the collapsed group consumes its result. Closing the group or changing objects must prevent stale results. Preserve the existing invalidation, retry, and navigation owners. Keep loading, error, and empty content inside the body. These states must not resize the summary. Do not defer data required by another visible consumer.

## Copyable values

Interface labels and hints remain outside mouse text selection. An explicit Copy command provides the full technical value without introducing a text caret across the row. Copy actions use the utility icon treatment: brighten the icon on hover, without a new filled surface or frame. Give the action a specific accessible name, such as Copy source identifier.

Keep its target at least 24px. Keep focus on the command after copying. Report success without changing the property text or accessible action name. A clipboard failure retains the value and provides a visible retry instruction. A genuinely editable or intentionally selectable text field follows its own input contract.

## Related objects

A related-project row navigates. It does not select the project or change the current property. Use a real link when a URL exists. Preserve modified-click, new-tab, keyboard, and browser link behavior. Use the existing command owner when product navigation requires an extension API instead of a URL. Use one consistent navigation icon for a related-object list. Do not add a checkbox or dropdown chevron.

A neutral row can brighten its text on hover. Keep adjacent rows visually separate with 4px spacing. User-authored object names in compact navigation buttons occupy one line. Truncate excess text at the trailing edge with an ellipsis. Keep the full stored and accessible name. Use the native browser title to expose the complete name on hover. Plain informational names can wrap. Loading, failure, empty results, and unavailable references have distinct readable states. An unavailable reference displays its name and reason as plain content. Do not display a working-looking navigation target.

## Existing consumers

The library preview's PreviewMetadataCards and PreviewProjectUsage establish the informational and navigation roles. Product acquisition, usage lookup, navigation, and clipboard permissions remain with their existing owners.
