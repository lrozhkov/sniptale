# Reference verification

[Design index](index.md)

## Per-group acceptance

Inspect one group at a time. Operate every declared case before advancing to the next group. Use both themes at 1280×560 and 1920×900 CSS viewports with DPR 1. Set viewport before navigation. Inspect settled, visible-area screenshots of each case, not only the page top. Check relevant breakpoint neighbors and a width below 1280 for horizontal scroll.

Check long names, unbroken values, local clipping, real overflow, short-height actions, and meaningful empty/error states. Keep desktop density distinct from touch-target requirements for supported touch surfaces.

## Required interactions

- Traverse label, padding, gap, and field with pointer and clicks. Hot regions must not contain dead activation strips.
- Traverse available and unavailable menu rows. Keep hover independent of the committed check.
- Use real Tab navigation to check focus. Keep focus indications thin and distinct. Preserve native focus-visible behavior for text entry.
- Exercise press, hold, release outside, interruption, and release once for commands.
- Check editing, valid acceptance, invalid draft retention, Escape, Save/Cancel, pending, failure, and retry.
- Drag ranges and scrollbars. Check hidden ranges during typing and no layout movement during hover.
- After pointer gestures, use keyboard commands without another focus click. Check native focus movement while an editor draft remains open.
- Check disappearing anchors, nested Escape, modal clipping, and focus after removal.
- Inspect contrast against actual themed and patterned backdrops, including reduced transparency and forced colors.
- Check reduced motion without hiding state feedback.

After control composition changes, check that input, focus, blur, composition, and keyboard events still reach the existing owner. Preserve its commit, cancellation, and retry behavior.

## Mixed-row rhythm

Below the minimum width, operate the actual horizontal scroll owner and reach the off-screen actions. Body overflow behind a modal does not prove access to its content.

Check every inspector category at regular and narrow widths, in both themes and languages. Compare visible label baselines across numbers, colors, switches, choices, and text fields. Include transitions between inline and stacked layouts and compound-resource rows. Check the actual text inset within each row. Do not restrict coverage to numeric, color, and boolean controls. For the explicit compact inspector, expect a 44px pitch: 40px row plus 4px gap. General 32px rows use a 36px pitch. Select the documented construction before comparing baselines. Allow 0.5px rounding tolerance for CSS pixel rounding. Check an 8px gap below the complete disclosure header target.

Check conditional controls and expanded nested groups. Hidden content must reserve no space. Record multiline labels, editors, errors, and explicit group boundaries as expansion reasons. Do not flatten those cases to satisfy a uniform-height assertion. Check hover and editing without row movement. Inspect the mixed composition after measurements.

## Review and evidence

Record source files, rule changes, proof commands, screenshots, review findings, and unresolved limitations outside the portable reference package. Expert review and successful checks do not imply user acceptance. Keep the exact user-reviewed version explicit. Preserve historical decisions outside the active catalog. Do not reintroduce rejected treatments through an old sample. Structural English lint does not establish dictionary compliance or compare requirements.

## Product implementation boundary

Reference examples do not authorize product changes by themselves. Product implementation follows repository planning, affected-consumer mapping, preflight, QA, and required reviews. Product portals, theme inheritance, assistive technology, physical touch, native permissions, and operating-system interruption require integration proof. A local HTML specimen does not establish complete WCAG compliance or production behavior.

Preserve accepted data and completed work after failure.

## Feedback correction cycle

Inventory the complete surface and its reachable states before inspection. Use the current feedback checklist with canonical rules. Separate observed defects, reported defects, and hypotheses. Check every element together with its neighbors, including hover and release states. Measure painted content as well as element bounds. Text can overflow a constant-height target even when its horizontal bounds pass.

Collect findings before one correction batch. For each established defect, record the trigger, violated rule, owner, cause, and reason that previous QA missed it. Check whether an old assertion encodes a rejected treatment. Correct the canonical rule and applicable example with the product owner when the finding establishes a reusable pattern. Preserve specialized interaction and data semantics. Recompose the layout when isolated offsets cannot satisfy the rule.

After correction, operate the affected states and inspect settled screenshots again. Check adjacent and transitive consumers. Record proof and remaining coverage per surface. Do not infer full-screen acceptance from one field, one screenshot, or passing unit tests.
