import { importAnimationArtifactBytes } from '../../../features/video/project/effect-bundle/lottie-profile';
import { createAnimationCatalogEntry } from './catalog-builder';
import { createHash } from 'node:crypto';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import {
  parseVisualCatalogPreference,
  type VisualCatalogPreference,
} from '../../../features/video/project/effect-bundle/catalog/presets';
import { installPersistenceLockManagerForTests } from '../infrastructure/mutation-barrier';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { saveEffectPresetPreferences } from './presets';
import { encodeEffectSettingsEntry } from './settings-transfer';
import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
const state = vi.hoisted(() => ({
  catalog: null as EffectBundleCatalogEntry | null,
  preference: {
    format: 'sniptale-visual-preferences',
    version: 1,
    kind: 'animation',
    packId: 'p',
    documents: {},
  } as VisualCatalogPreference,
}));
vi.mock('./index', async (original) => ({
  ...(await original<typeof import('./index')>()),
  getEffectBundle: async () => {
    const { overlayVisualAnimationPreferences } = await import('./preferences');
    return state.catalog && overlayVisualAnimationPreferences(state.catalog, [state.preference]);
  },
}));
vi.mock('./preferences', async (original) => ({
  ...(await original<typeof import('./preferences')>()),
  mutateVisualCatalogPreference: async (
    _kind: string,
    _id: string,
    update: (row: VisualCatalogPreference) => VisualCatalogPreference
  ) => {
    state.preference = update(state.preference);
  },
}));
const source = readFileSync(
  'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json',
  'utf8'
);
const document = parseAnimationTemplateSource(source).template;
if (!document) throw new Error('Expected valid shipped animation.');
const hash = createHash('sha256').update(source).digest('hex');
beforeEach(() => {
  installPersistenceLockManagerForTests({
    request: (_name, _options, operation) => Promise.resolve().then(operation),
  });
  state.catalog = {
    packId: 'animation.sniptale-callout',
    source: 'sniptale-animation',
    sourceSha256: hash,
    version: '2',
    createdAt: 1,
    updatedAt: 1,
    enabled: true,
    label: { en: document.label.en, ru: document.label.ru ?? document.label.en },
    description: { en: '', ru: '' },
    assets: [],
    retainedByteLength: Buffer.byteLength(source),
    documents: [
      {
        id: document.id,
        source,
        sha256: hash,
        schemaVersion: 'sniptale.animation.v1',
        kind: 'standalone',
        assets: [],
      },
    ],
  };
  state.preference = {
    format: 'sniptale-visual-preferences',
    version: 1,
    kind: 'animation',
    packId: state.catalog.packId,
    documents: {},
  };
});
afterEach(() => installPersistenceLockManagerForTests(null));
it('stores preferences separately and transfers them without embedding definitions', async () => {
  const doc = state.catalog!.documents[0]!;
  const preferences = {
    presets: [
      {
        id: 'mine',
        name: 'Мой',
        values: document.controlPresets![0]!.values,
      },
    ],
  };
  const saved = await saveEffectPresetPreferences(
    state.catalog!.packId,
    doc.id,
    doc.sha256,
    preferences
  );
  expect(saved.documents[0]!.presetPreferences).toEqual(preferences);
  const portable = [state.preference];
  expect(JSON.parse(JSON.stringify(portable)).map(parseVisualCatalogPreference)).toEqual(portable);
  expect(JSON.stringify(portable)).not.toContain('graph');
  const artifact = await importAnimationArtifactBytes(new TextEncoder().encode(source));
  if (!artifact.ok) throw new Error('Expected valid animation.');
  const imported = await encodeEffectSettingsEntry(await createAnimationCatalogEntry(artifact, 1));
  expect(Object.hasOwn(imported.documents[0]!, 'presetPreferences')).toBe(false);
});
it('rejects stale writes and new protected values, but retains an unavailable old preset', async () => {
  const doc = state.catalog!.documents[0]!;
  const unavailable = { presets: [{ id: 'old', name: 'Old', values: { removed: 3 } }] };
  state.preference.documents[doc.id] = { sourceSha256: doc.sha256, presetPreferences: unavailable };
  await expect(
    saveEffectPresetPreferences(state.catalog!.packId, doc.id, doc.sha256, { presets: [] })
  ).rejects.toThrow('presets changed');
  await saveEffectPresetPreferences(
    state.catalog!.packId,
    doc.id,
    doc.sha256,
    unavailable,
    unavailable
  );
  await expect(
    saveEffectPresetPreferences(
      state.catalog!.packId,
      doc.id,
      doc.sha256,
      { presets: [{ id: 'text', name: 'Text', values: { title: 'bad' } }] },
      unavailable
    )
  ).rejects.toThrow('Invalid effect presets');
  await expect(
    saveEffectPresetPreferences(
      state.catalog!.packId,
      doc.id,
      'f'.repeat(64),
      unavailable,
      unavailable
    )
  ).rejects.toThrow('catalog changed');
  expect(state.preference.documents[doc.id]?.presetPreferences).toEqual(unavailable);
});

it('rejects missing catalogs and unavailable new defaults without discarding saved presets', async () => {
  const catalog = state.catalog!;
  state.catalog = null;
  await expect(saveEffectPresetPreferences('p', 'missing', 'sha', { presets: [] })).rejects.toThrow(
    'Effect catalog changed'
  );
  state.catalog = catalog;
  const doc = catalog.documents[0]!;
  await expect(
    saveEffectPresetPreferences(catalog.packId, doc.id, doc.sha256, {
      presets: [],
      defaultPreset: { kind: 'user', id: 'missing' },
    })
  ).rejects.toThrow('Unavailable effect preset');
  const id = document.controlPresets![0]!.id;
  await expect(
    saveEffectPresetPreferences(catalog.packId, doc.id, doc.sha256, {
      presets: [],
      defaultPreset: { kind: 'builtin', id },
    })
  ).resolves.toBeTruthy();
});
