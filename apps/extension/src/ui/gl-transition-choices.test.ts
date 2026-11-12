import { expect, it } from 'vitest';
import { createGlTransitionSelection } from '../features/video/project/transition/gl-catalog';
import {
  glTransitionChoices,
  glTransitionChoiceValue,
  resolveGlTransitionChoice,
  type GlTransitionChoiceCatalog,
} from './gl-transition-choices';
const original = createGlTransitionSelection('CrossZoom');
if (!original) throw Error('Missing CrossZoom');
const custom = { ...original, values: { ...original.values, strength: 0.73 } };
const catalog: GlTransitionChoiceCatalog = {
  loading: false,
  error: false,
  items: [
    {
      id: 'builtin:CrossZoom',
      name: 'CrossZoom',
      builtin: true,
      enabled: false,
      status: 'ready',
      selection: original,
    },
    {
      id: 'gl.custom',
      name: 'My preset',
      builtin: false,
      enabled: true,
      status: 'ready',
      selection: custom,
    },
    { id: 'gl.future', name: 'Future', builtin: false, enabled: true, status: 'unsupported' },
  ],
};
it(
  'offers only enabled executable entries and preserves imported ' +
    'parameter values without lending mutable state',
  () => {
    expect(glTransitionChoices(catalog)).toEqual([{ value: 'gl.custom', label: 'My preset' }]);
    const selected = resolveGlTransitionChoice(catalog, 'gl.custom');
    expect(selected).toEqual(custom);
    expect(selected).not.toBe(custom);
    selected!.values['strength'] = 0.1;
    expect(custom.values['strength']).toBe(0.73);
    expect(resolveGlTransitionChoice(catalog, 'CrossZoom')).toBeNull();
    expect(resolveGlTransitionChoice(catalog, 'gl.future')).toBeNull();
  }
);
it('keeps a disabled applied selection visible without granting a new apply operation', () => {
  const snapshot = structuredClone(original);
  expect(glTransitionChoiceValue(catalog, original)).toBe('CrossZoom');
  expect(glTransitionChoices(catalog, original)).toContainEqual({
    value: 'CrossZoom',
    label: 'CrossZoom',
    disabled: true,
  });
  expect(original).toEqual(snapshot);
  expect(resolveGlTransitionChoice(catalog, 'CrossZoom')).toBeNull();
});
it.each([
  { loading: true, error: false },
  { loading: false, error: true },
])('does not replace an unavailable catalogue with implicit builtin choices: %j', (flags) => {
  const unavailable = { ...catalog, ...flags };
  expect(glTransitionChoices(unavailable)).toEqual([]);
  expect(resolveGlTransitionChoice(unavailable, 'CrossZoom')).toBeNull();
  expect(resolveGlTransitionChoice(unavailable, 'gl.custom')).toBeNull();
  expect(glTransitionChoices(unavailable, original)).toEqual([
    { value: 'CrossZoom', label: 'CrossZoom', disabled: true },
  ]);
});
it('matches parameter values independently of object key order, but requires the exact pinned implementation', () => {
  const reordered = {
    ...custom,
    values: Object.fromEntries(Object.entries(custom.values).reverse()),
  };
  expect(glTransitionChoiceValue(catalog, reordered)).toBe('gl.custom');
  expect(glTransitionChoiceValue(catalog, { ...custom, wgslSha256: '0'.repeat(64) })).toBe(
    'CrossZoom'
  );
});
it('retains standalone pure-field builtin choices when no catalogue dependency is supplied', () => {
  expect(glTransitionChoices()).toHaveLength(214);
  expect(resolveGlTransitionChoice(undefined, 'CrossZoom')).toEqual(original);
});
