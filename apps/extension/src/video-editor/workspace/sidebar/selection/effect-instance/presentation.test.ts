import { expect, it } from 'vitest';
import type { EffectControlContext } from '@sniptale/runtime-contracts/effect-controls';
import { getEffectControlSections, getEffectSequenceOptions } from './presentation';
function document(): EffectControlContext & { id: string } {
  return {
    id: 'metadata-example',
    controls: [
      {
        id: 'sequence',
        kind: 'number',
        defaultValue: 0,
        min: 0,
        max: 2,
        step: 1,
        group: 'animation',
      },
    ],
    objectLayout: { handles: [{ xControl: 'anchorX', yControl: 'anchorY' }] },
  };
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
  delete sequence.options;
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
it('preserves animation group identities for existing inspector preferences', () => {
  const doc = document();
  doc.controls = [{ id: 'entry', kind: 'number', defaultValue: 20, group: 'animation' }];
  const [section] = getEffectControlSections(doc);
  expect(section?.id).toBe('animation');
  expect(section?.semantic).toBe('animation');
});
