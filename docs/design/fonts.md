# Font families and installation

[Typography roles](foundations.md#typography-and-hierarchy) · [Design index](index.md)

## Family parameters

`packages/ui/src/styles/design-tokens.css` owns family parameters. Components and portaled menus use `--sniptale-font-interface`, never literal family names. The compatibility token `--sniptale-font-sans` retains the interface family. The separate `--sniptale-font-document-sans` selects the authored-text family.

The popup uses the same bundled interface family. Calibrate its compact roles within its own shell: body 400, labels 450, headings 500, and stronger emphasis 550. Preserve its established geometry and semantic status colors. Do not copy these surface-specific weights into other interfaces.

## Bundled faces and replacement

`packages/ui/src/styles/fonts.css` owns faces and weights. The `Sniptale Sans` face preserves the family alias in stored documents. This alias uses the same Golos UI bytes as `Sniptale Interface`. New default authored text uses `Sniptale Text`, backed by the bundled Golos Text variable font with weights from 400 through 900. The bundled Golos UI variable font supports weights from 400 through 700, including 600. Ordinary roles use 400 and 500 for calm hierarchy. Font capability does not determine role weight.

Golos UI checks found stable advances for tested Russian and English strings at 400, 500, 600, and 700. All glyph advances also matched from 400 to 500. This evidence does not prove equal advances for every weight or language. Its stable `Sniptale Interface` alias currently maps to Golos UI assets.

Replace backing assets in this face owner to change the bundled family. Keep component family references unchanged. Select another family parameter only for a registered face or fallback stack. Keep family selection independent from size, line height, weight, and foreground. New files require build-asset and manifest inventory updates.

## Runtime installation

Content UI explicitly registers both stable aliases from trusted bundled font declarations. Reuse each runtime's installation owner and retain descriptors with bundled declarations. After replacement, check registered faces and painted Russian/English glyphs, narrow controls, and expanded text. Check detached layers, embedded UI, inherited status/duration, and controls. CSS declarations, asset requests, or child overrides alone do not prove font use. Load failure preserves usable fallback text and interactions.

## Documents and exports

`--sniptale-font-document-sans` selects the default sans-serif family for new documents. It uses `Sniptale Text`. Standalone text exports embed Golos Text for content and Golos UI for interface controls, with both licenses. Ordinary text input uses the document family. Numbers, structured codes, and explicit monospace editors retain their declared roles.

Font replacement must preserve explicit family choices in stored canvas text and captions. Document and rendering owners retain these values. Existing exported media and explicit stored families remain unchanged. Source-preserving snapshot exports retain source typography.
