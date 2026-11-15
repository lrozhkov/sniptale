import { expect, it } from 'vitest';
import {
  validateAnimationTemplate,
  listAnimationTemplateSlots,
} from '@sniptale/runtime-contracts/animation-template';
import { createSlotMappingDrafts, prepareSlotMappedAnimation } from './slot-mapping-model';

function template() {
  const result = validateAnimationTemplate({
    format: 'sniptale-animation',
    version: 1,
    id: 'source',
    label: { en: 'Source' },
    controls: [],
    bindings: [],
    resources: [],
    animation: {
      v: '5.12.2',
      w: 320,
      h: 180,
      fr: 30,
      ip: 0,
      op: 60,
      assets: [],
      layers: [],
      slots: {
        title: { p: { a: 0, k: [{ t: 0, s: { t: 'Keep text' } }] } },
        color: { p: { a: 0, k: [1, 0.5, 0, 0.5] } },
        opacity: { p: { a: 0, k: 0.7 } },
        position: { p: { a: 0, k: [160, 90] } },
        animated: {
          p: {
            a: 1,
            k: [
              { t: 0, s: [0] },
              { t: 30, s: [1] },
            ],
          },
        },
      },
    },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.template;
}
it('prepares text/color/scalar/vector controls without changing animation keys or original source', () => {
  const source = template(),
    before = structuredClone(source);
  const drafts = createSlotMappingDrafts(source).map((draft) => ({
    ...draft,
    enabled: draft.slotId !== 'animated',
  }));
  const copy = prepareSlotMappedAnimation({
    template: source,
    drafts,
    id: 'prepared',
    label: 'Prepared',
  });
  expect(copy.id).toBe('prepared');
  expect(copy.animation).toEqual(before.animation);
  expect(copy.controls.map((control) => control.kind)).toEqual([
    'text',
    'color',
    'number',
    'number',
    'number',
  ]);
  expect(copy.controls[0]!.defaultValue).toBe('Keep text');
  expect(copy.controls[1]!.defaultValue).toBe('#ff800080');
  expect(copy.bindings.map((binding) => binding.kind)).toEqual([
    'text',
    'color',
    'scalar',
    'vector',
  ]);
  expect(copy.controls.slice(-2).map((control) => control.group)).toEqual(['geometry', 'geometry']);
  expect(source).toEqual(before);
  expect(listAnimationTemplateSlots(copy).find((slot) => slot.id === 'title')?.unavailable).toBe(
    'bound'
  );
  expect(listAnimationTemplateSlots(copy).find((slot) => slot.id === 'animated')?.unavailable).toBe(
    'animated'
  );
});
it('inverts fixed units into defaults so binding does not change the source image', () => {
  const source = template();
  const drafts = createSlotMappingDrafts(source)
    .filter((draft) => ['opacity', 'position'].includes(draft.slotId))
    .map((draft) => ({
      ...draft,
      enabled: true,
      minimum: '0',
      maximum: '100',
      unit:
        draft.slotId === 'opacity'
          ? ('percent-to-ratio' as const)
          : ('normalized-to-pixels' as const),
    }));
  const copy = prepareSlotMappedAnimation({
    template: source,
    drafts,
    id: 'units',
    label: 'Units',
  });
  expect(copy.controls.map((control) => control.defaultValue)).toEqual([70, 0.5, 0.5]);
  expect(copy.bindings).toMatchObject([
    { unit: 'percent-to-ratio' },
    { unit: 'normalized-to-pixels' },
  ]);
});
it.each(['duplicate', 'unknown', 'animated', 'range', 'unit', 'label', 'empty'] as const)(
  'refuses %s mapping before a source can be published',
  (kind) => {
    const source = template();
    const draft = {
      ...createSlotMappingDrafts(source).find((draft) => draft.slotId === 'opacity')!,
      enabled: true,
    };
    let drafts = [draft];
    if (kind === 'duplicate') drafts = [draft, draft];
    if (kind === 'unknown') draft.slotId = 'missing';
    if (kind === 'animated') draft.slotId = 'animated';
    if (kind === 'range') draft.maximum = '-1';
    if (kind === 'unit') draft.unit = 'normalized-to-pixels';
    if (kind === 'label') draft.label = ' ';
    if (kind === 'empty') draft.enabled = false;
    expect(() =>
      prepareSlotMappedAnimation({ template: source, drafts, id: 'copy', label: 'Copy' })
    ).toThrow();
  }
);
it('preserves already-owned bindings, controls and source keys when another slot is prepared', () => {
  const source = template();
  const first = prepareSlotMappedAnimation({
    template: source,
    drafts: createSlotMappingDrafts(source).map((draft) => ({
      ...draft,
      enabled: draft.slotId === 'title',
    })),
    id: 'first',
    label: 'First',
  });
  const second = prepareSlotMappedAnimation({
    template: first,
    drafts: createSlotMappingDrafts(first).map((draft) => ({
      ...draft,
      enabled: draft.slotId === 'opacity',
    })),
    id: 'second',
    label: 'Second',
  });
  expect(second.controls[0]).toEqual(first.controls[0]);
  expect(second.bindings[0]).toEqual(first.bindings[0]);
  expect(second.animation).toEqual(first.animation);
  expect(() =>
    prepareSlotMappedAnimation({
      template: first,
      drafts: createSlotMappingDrafts(first).map((draft) => ({
        ...draft,
        enabled: draft.slotId === 'title',
      })),
      id: 'invalid',
      label: 'Invalid',
    })
  ).toThrow();
});
