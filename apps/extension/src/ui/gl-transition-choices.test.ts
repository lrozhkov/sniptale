import { beforeEach, expect, it, vi } from 'vitest';
import { GL_TRANSITIONS } from '../features/video/project/transition/gl-catalog';
import { getCatalogFixture } from '../platform/i18n/catalog-fixture.test-support';
import { glTransitionParameterLabel } from './gl-transition-labels';
const state = vi.hoisted(() => ({ locale: 'en' as 'en' | 'ru' }));
vi.mock('../platform/i18n', async (original) => {
  const fixture = await import('../platform/i18n/catalog-fixture.test-support');
  return {
    ...(await original<typeof import('../platform/i18n')>()),
    translate: (
      key: Parameters<typeof fixture.translateCatalogFixture>[0],
      locale = state.locale
    ) => fixture.translateCatalogFixture(key, locale),
  };
});
beforeEach(() => {
  state.locale = 'en';
});
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
    label: 'Zoom blur',
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
    { value: 'CrossZoom', label: 'Zoom blur', disabled: true },
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

it.each(['en', 'ru'] as const)(
  'covers every pinned built-in name and parameter in %s',
  (locale) => {
    const labels = getCatalogFixture(locale).videoEditor.glTransitions;
    expect(Object.keys(labels.names).sort()).toEqual(
      GL_TRANSITIONS.map((item) => item.name).sort()
    );
    expect(Object.keys(labels.parameters).sort()).toEqual(
      [...new Set(GL_TRANSITIONS.flatMap((item) => Object.keys(item.params)))].sort()
    );
    expect(Object.values(labels.names).every((label) => label.trim().length > 0)).toBe(true);
    expect(Object.values(labels.parameters).every((label) => label.trim().length > 0)).toBe(true);
  }
);
it.each([
  ['en', 'Fast vertical pan', 'Pan downward', 'Color separation'],
  ['ru', 'Резкая вертикальная панорама', 'Панорама вниз', 'Разделение цветов'],
] as const)(
  'shows authored effect and parameter labels in %s while preserving IDs',
  (locale, name, down, chroma) => {
    state.locale = locale;
    expect(glTransitionChoices()).toContainEqual({ value: 'WhipTilt', label: name });
    expect(glTransitionParameterLabel('down', locale)).toBe(down);
    expect(glTransitionParameterLabel('chroma', locale)).toBe(chroma);
    expect(glTransitionParameterLabel('grid.x', locale)).toBe(
      locale === 'en' ? 'Grid size · X' : 'Размер сетки · X'
    );
  }
);
it('preserves imported literal names even when they match a built-in identifier', () => {
  state.locale = 'ru';
  const imported: GlTransitionChoiceCatalog = {
    loading: false,
    error: false,
    items: [
      {
        id: 'gl.custom',
        name: 'WhipTilt',
        builtin: false,
        enabled: true,
        status: 'ready',
        selection: original,
      },
    ],
  };
  expect(glTransitionChoices(imported)).toEqual([{ value: 'gl.custom', label: 'WhipTilt' }]);
  expect(resolveGlTransitionChoice(imported, 'gl.custom')).toEqual(original);
});
it('uses canonical built-in metadata only when the catalog identity and implementation match', () => {
  const selection = createGlTransitionSelection('WhipTilt')!;
  const item = {
    id: 'builtin:WhipTilt',
    name: 'WhipTilt',
    builtin: true,
    enabled: true,
    status: 'ready' as const,
    selection,
  };
  const source = { loading: false, error: false, items: [item] };
  expect(glTransitionChoices(source)).toEqual([{ value: 'WhipTilt', label: 'Fast vertical pan' }]);
  expect(glTransitionChoices({ ...source, items: [{ ...item, id: 'custom:WhipTilt' }] })).toEqual([
    { value: 'WhipTilt', label: 'WhipTilt' },
  ]);
  expect(
    glTransitionChoices({
      ...source,
      items: [{ ...item, selection: { ...selection, wgslSha256: '0'.repeat(64) } }],
    })
  ).toEqual([{ value: 'WhipTilt', label: 'WhipTilt' }]);
});
