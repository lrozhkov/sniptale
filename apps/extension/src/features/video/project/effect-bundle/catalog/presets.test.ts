import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import {
  applyEffectControlPreset,
  resolveEffectControlDefault,
} from '@sniptale/runtime-contracts/effect-controls';
import {
  applyInitialEffectPreset,
  collectEffectVisualValues,
  parseEffectPresetPreferences,
} from './presets';
const source = readFileSync(
  'apps/extension/public/video-effects/animations/callout.sniptale-animation.json',
  'utf8'
);
const document = parseAnimationTemplateSource(source).template!;
it('switches visual styles without changing text, geometry or pointer controls', () => {
  const current = Object.fromEntries(
    document.controls.map((control) => [control.id, resolveEffectControlDefault(control, 'ru')])
  );
  current['title'] = 'Custom';
  const before = structuredClone(current);
  const next = applyEffectControlPreset(document, current, 'midnight-blue');
  for (const [id, value] of Object.entries(before)) {
    if (!(id in document.controlPresets![1]!.values)) expect(next[id]).toBe(value);
  }
  expect(current).toEqual(before);
  expect(next['title']).toBe('Custom');
  expect(() => applyEffectControlPreset(document, current, 'missing')).toThrow();
});
it('validates user settings against the visual protected-field boundary and applies defaults only at creation', () => {
  const values = document.controlPresets![0]!.values;
  const preferences = {
    presets: [{ id: 'mine', name: 'My style', values }],
    defaultPreset: { kind: 'user' as const, id: 'mine' },
  };
  expect(parseEffectPresetPreferences(source, preferences)).toEqual(preferences);
  expect(applyInitialEffectPreset(document, { title: 'Mine' }, preferences)).toEqual({
    title: 'Mine',
    ...values,
  });
  expect(applyInitialEffectPreset(document, { title: '' }, preferences, 'midnight-blue')).toEqual({
    title: '',
    ...document.controlPresets!.find((preset) => preset.id === 'midnight-blue')!.values,
  });
  expect(
    applyInitialEffectPreset(document, { title: 'Explicit' }, preferences, 'user:mine')['title']
  ).toBe('Explicit');
  for (const invalid of [{ title: 'Overwrite' }, { unknown: 1 }, { ...values, title: '' }]) {
    expect(
      parseEffectPresetPreferences(source, {
        presets: [{ id: 'bad', name: 'Bad', values: invalid }],
      })
    ).toBeNull();
  }
  expect(
    parseEffectPresetPreferences(source, {
      ...preferences,
      defaultPreset: { kind: 'user', id: 'missing' },
    })
  ).toBeNull();
  expect(collectEffectVisualValues(document, { ...values, title: 'Do not save' })).toEqual(values);
});

it('retains unavailable visual preferences without applying them to a foreign same-ID document', async () => {
  const { parseVisualCatalogPreference, resolveVisualCatalogDocumentPreference } =
    await import('./presets');
  const packet = {
    format: 'sniptale-visual-preferences',
    version: 1,
    kind: 'animation',
    packId: 'animation.same',
    enabled: false,
    documents: {
      same: {
        sourceSha256: 'a'.repeat(64),
        presetPreferences: { presets: [{ id: 'mine', name: 'Mine', values: { amount: 25 } }] },
      },
    },
  };
  const parsed = parseVisualCatalogPreference(packet);
  expect(parsed).not.toBeNull();
  if (!parsed) return;
  const before = JSON.stringify(parsed);
  const identity = {
    kind: 'animation' as const,
    packId: 'animation.same',
    documentId: 'same',
    sourceSha256: 'b'.repeat(64),
  };
  expect(resolveVisualCatalogDocumentPreference(identity, [parsed])).toEqual({
    enabled: true,
    unavailable: true,
  });
  expect(
    resolveVisualCatalogDocumentPreference({ ...identity, sourceSha256: 'a'.repeat(64) }, [parsed])
  ).toEqual({
    enabled: false,
    unavailable: false,
    presetPreferences: packet.documents.same.presetPreferences,
  });
  expect(
    resolveVisualCatalogDocumentPreference(
      { ...identity, kind: 'transition', sourceSha256: 'a'.repeat(64) },
      [parsed]
    )
  ).toEqual({ enabled: true, unavailable: false });
  expect(JSON.stringify(parsed)).toBe(before);
});

it('rejects old or executable visual preference envelopes at the new boundary', async () => {
  const { parseVisualCatalogPreference } = await import('./presets');
  const packet = {
    format: 'sniptale-visual-preferences',
    version: 1,
    kind: 'transition',
    packId: 'builtin:gl-transitions@3.2.0',
    documents: { Fade: { sourceSha256: 'a'.repeat(64) } },
  };
  expect(parseVisualCatalogPreference(packet)).not.toBeNull();
  for (const invalid of [
    { packId: packet.packId, documents: {} },
    { ...packet, version: 2 },
    { ...packet, script: 'arbitrary code' },
    { ...packet, documents: { Fade: { sourceSha256: 'https://example.com/shader.wgsl' } } },
  ])
    expect(parseVisualCatalogPreference(invalid)).toBeNull();
});
