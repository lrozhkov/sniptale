import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseEffectV1Source } from '@sniptale/runtime-contracts/effect-v1';
import { getEffectControlSections, getEffectSequenceOptions } from './presentation';
function document() {
  const source = readFileSync(
    new URL(
      '../../../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/collection/' +
        'sniptale-callout-light.sniptale-effect.json',
      import.meta.url
    ),
    'utf8'
  );
  const parsed = parseEffectV1Source(source).document;
  if (!parsed) throw new Error('Invalid fixture');
  return parsed;
}
it('groups callout settings and hides local axes and rare spark controls', () => {
  const doc = document();
  const sections = getEffectControlSections(doc);
  expect(sections.flatMap((s) => s.controls.map((c) => c.id))).not.toContain('anchorX');
  expect(sections.flatMap((s) => s.controls.map((c) => c.id))).not.toContain('anchorY');
  expect(sections.filter((s) => s.advanced).flatMap((s) => s.controls.map((c) => c.id))).toEqual([
    'spark',
  ]);
  expect(
    sections.find((s) => s.controls.some((c) => c.id === 'sequence'))!.controls.map((c) => c.id)
  ).toEqual(['sequence', 'entry', 'traceShare']);
  const sequence = doc.controls.find((c) => c.id === 'sequence')!;
  expect(getEffectSequenceOptions(doc.id, sequence)?.map((o) => o.value)).toEqual(['0', '1', '2']);
  expect(getEffectSequenceOptions('external-effect', sequence)).toBeNull();
  expect(getEffectSequenceOptions(doc.id, doc.controls[0]!)).toBeNull();
});
it('preserves generic and additional authored parameters instead of interpreting arbitrary numbers as enums', () => {
  const doc = document();
  doc.controls.push({
    id: 'extra',
    kind: 'number',
    label: { en: 'Extra', ru: 'Дополнительно' },
    defaultValue: 1,
    min: 0,
    max: 2,
    step: 1,
  });
  expect(
    getEffectControlSections(doc)
      .at(-1)!
      .controls.map((c) => c.id)
  ).toEqual(['extra']);
  expect(getEffectSequenceOptions(doc.id, doc.controls.at(-1)!)).toBeNull();
  doc.id = 'external-effect';
  expect(getEffectControlSections(doc)).toHaveLength(1);
  expect(getEffectControlSections(doc)[0]!.controls.map((c) => c.id)).toContain('extra');
});
