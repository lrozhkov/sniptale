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
it('groups explicit metadata independently of template names, preserving source order for ties', () => {
  const doc = document();
  doc.id = 'external-effect';
  doc.controls = [
    { id: 'late', kind: 'text', defaultValue: '', group: 'content', order: 2 },
    { id: 'early', kind: 'text', defaultValue: '', group: 'content', order: 1 },
    { id: 'custom', kind: 'number', defaultValue: 0, group: 'future-group' },
    { id: 'ungrouped', kind: 'number', defaultValue: 0 },
    { id: 'anchorX', kind: 'number', defaultValue: 0, group: 'geometry' },
  ];
  const sections = getEffectControlSections(doc);
  expect(sections.map((s) => s.controls.map((c) => c.id))).toEqual([
    ['early', 'late'],
    ['custom', 'ungrouped'],
  ]);
  expect(sections.at(-1)?.advanced).toBe(true);
});
it('uses authored enum labels and never guesses options from numeric ranges', () => {
  const doc = document();
  const sequence = doc.controls.find((c) => c.id === 'sequence')!;
  expect(getEffectSequenceOptions(doc.id, sequence)).toBeNull();
  sequence.options = [
    { value: 0, label: { en: 'One' } },
    { value: 1, label: { en: 'Two' } },
  ];
  expect(getEffectSequenceOptions('external', sequence)).toEqual([
    { value: '0', label: 'One' },
    { value: '1', label: 'Two' },
  ]);
});
