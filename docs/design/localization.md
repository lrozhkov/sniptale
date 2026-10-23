# Localization and text fitting

[Design index](index.md) · [Working specimens](../../tooling/design-reference/examples/foundations/index.html)

Russian and English are the reference UI languages. Their current lengths do not define fixed layout widths. Design for longer translations without per-language CSS. Use the existing product localization owner, not concatenated translated fragments. The reference language switch is a sandbox adapter, not a replacement for product i18n.

## Decide overflow behavior by text role

| Text role | Default | When space remains insufficient |
| --- | --- | --- |
| Parameter name | Wrap at word boundaries | Stack value below name before words become letter columns |
| Current parameter value | Wrap while keeping its value column stable | End ellipsis only for a declared dense single-line context |
| Command | Content-sized target, flexible action row | Wrap or move the complete command to an overflow menu |
| Critical/destructive command | Complete explicit action name | Do not truncate its meaning or hide the destructive object |
| Tab, category, segment | Flexible width or supported scrolling | Use an alternate navigation/choice representation before clipping labels |
| Object title | Wrap in rows/cards | End ellipsis in an explicitly fixed-height row |
| Filename or path | Wrap where practical | Middle ellipsis preserving identifying suffix/extension |
| Numeric value, unit, HEX, dimensions | Keep meaningful parts together | Reflow the row. Never hide digits, units, alpha, or a dimension |
| Hint and error | Wrap and grow | Do not truncate required recovery instructions |
| Optional hint | Omit a hint that repeats fully visible text | Expose clipped text on hover and keyboard focus |

Do not abbreviate translated UI strings by character count. Use actual available width after padding, icons, state marks, and trailing actions. Keep existing inner padding and icon/text gaps when ellipsis appears. It replaces text, not padding. Use a single ellipsis at the logical end for ordinary names and values.

Middle ellipsis is for identifying paths/filenames, not translated command phrases. Preserve grapheme clusters. Do not cut a surrogate pair, combining mark, or joined emoji sequence. Do not split a word into vertical letter columns to preserve an arbitrary row height.

## Full-text access

A truncated label retains its complete accessible name and unchanged underlying value. Use native browser `title` for optional hover hints. Do not draw custom tooltips. Omit duplicate hints when the complete text is visible. Measure clipping from the rendered element, not the character count. Preserve the existing control's focus target. Do not add Tab stops or change control dimensions for hints.

Visible button text supplies its accessible name. Icon-only buttons require an accessible name, such as `aria-label`. Removing a duplicate hint must not remove that name. Do not use `title` as the only name or instruction. Browser hover hints do not provide reliable keyboard or touch access.

Additional explanations remain available regardless of label clipping. Keep required instructions and recovery actions visible, or provide an explicit detail action. Put irreversible-deletion warnings in the confirmation, not only in a hint. Use an accessible description for supplemental instructions. Do not replace the action name with its explanation.

The shared `ui/native-hints` owner controls conditional `title` attributes in popup, Settings, and Design System pages. The browser owns hint presentation and dismissal. Native hints are not reliable visual disclosure on keyboard focus. Preserve full accessible names and existing choice or detail surfaces for keyboard access. Do not add custom hint layers, focus-only text wrapping, or control resizing.

[W3C accessible names and descriptions](https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/) explains the naming and description techniques.

Editable input values retain normal caret movement and horizontal text scrolling. Preserve copyable full values.

## Language-independent structure

Use logical inline/block spacing where direction matters. Do not assume that future languages all read left to right. Preserve identifiers, HEX, paths, and numeric tokens with appropriate bidirectional isolation. Use locale-aware number, date, plural, and unit formatting through product owners. Do not parse localized visible text as stored data. Allow font fallback for unsupported scripts without changing role hierarchy. Check glyph coverage rather than shrinking the font.

Do not use font-size reduction as the first overflow fix. Surface-specific rules still apply to popup, timeline labels, timecodes, and canvas annotations.

## Proof boundary

Check Russian, English, 1.5× expanded labels, and a 2× short-label stress case at the primary viewports and narrow owned columns. The adapter doubles labels of up to 12 characters and expands longer labels by approximately 1.5×, with visible stress markers. These expansion factors are engineering stress inputs, not promises about all translations. Check unbroken filenames, long words, icons plus text, selected states, errors, and keyboard full-text access.

Check text zoom separately from a narrow viewport. Real right-to-left localization requires its own rendered proof before release. A passing two-language specimen does not establish linguistic correctness or layout coverage for every future language.

[W3C internationalization tips](https://www.w3.org/International/quicktips/index), [W3C text expansion](https://www.w3.org/International/articles/article-text-size), [Carbon tag truncation](https://www.carbondesignsystem.com/building-blocks/core/components/tag/guidelines).
