import { expect, it, vi } from 'vitest';
import { readValidAnimationCatalog } from '../../composition/persistence/effect-bundles/fixture.test-support';
import type { EffectRuntimeRenderCommand } from '../../contracts/effect-runtime/types';
import { getEffectRuntimeIdentity } from '../../contracts/effect-runtime/identity';
import {
  renderEffectCatalogPreview,
  effectPreviewProgress,
  effectPosterKey,
} from './effect-catalog-preview';

class Bitmap implements ImageBitmap {
  close = vi.fn();
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}
it('materializes one verified self-contained animation and returns caller-owned output', async () => {
  const catalog = await readValidAnimationCatalog(),
    document = catalog.documents[0]!;
  const bitmap = new Bitmap(320, 180);
  const renderFrame = vi.fn(async (command: EffectRuntimeRenderCommand) => {
    const immutable = await command.materializeImmutablePayloads();
    expect(immutable.documentSource).toBe(document.source);
    expect(immutable.assets).toEqual([]);
    expect(command.inputFrames).toEqual({});
    expect(command.duration).toBe(3);
    expect(command.time).toBe(1.5);
    return {
      ...getEffectRuntimeIdentity(command),
      kind: 'frame' as const,
      bitmap,
      width: bitmap.width,
      height: bitmap.height,
      acknowledged: {
        documentId: command.documentRef.id,
        assetSelectionId: command.assetSelectionRef.id,
      },
    };
  });
  await expect(
    renderEffectCatalogPreview({ renderFrame, dispose: vi.fn() }, catalog, document, 0.5, 1)
  ).resolves.toBe(bitmap);
  expect(bitmap.close).not.toHaveBeenCalled();
});
it('rejects retired source and transition package roles before creating sampled inputs', async () => {
  const catalog = await readValidAnimationCatalog(),
    canvas = vi.fn();
  vi.stubGlobal('OffscreenCanvas', canvas);
  try {
    for (const kind of ['targetEffect', 'transition'] as const) {
      const entry = { ...catalog.documents[0]! };
      Reflect.set(entry, 'kind', kind);
      const renderFrame = vi.fn(async () => {
        throw new Error('sandbox unavailable');
      });
      await expect(
        renderEffectCatalogPreview(
          { renderFrame, dispose: vi.fn() },
          { ...catalog, documents: [entry] },
          entry,
          0.25,
          1
        )
      ).rejects.toMatchObject({ code: 'effectCatalogIntegrityFailure' });
      expect(renderFrame).not.toHaveBeenCalled();
    }
    expect(canvas).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
it('keeps sandbox failure explicit and refuses invalid preview times before execution', async () => {
  const catalog = await readValidAnimationCatalog(),
    entry = catalog.documents[0]!;
  const renderFrame = vi.fn(async () => {
    throw new Error('sandbox unavailable');
  });
  await expect(
    renderEffectCatalogPreview({ renderFrame, dispose: vi.fn() }, catalog, entry, 0.25, 1)
  ).rejects.toThrow('sandbox unavailable');
  for (const progress of [-0.1, 1.1, NaN])
    await expect(
      renderEffectCatalogPreview({ renderFrame, dispose: vi.fn() }, catalog, entry, progress, 2)
    ).rejects.toThrow('Invalid preview time');
  expect(renderFrame).toHaveBeenCalledOnce();
});
it('gives long entrance and exit animations scrub space while keeping short animations linear', async () => {
  expect(effectPreviewProgress(0.2, 10)).toBeCloseTo(0.05);
  expect(effectPreviewProgress(0.8, 10)).toBeCloseTo(0.95);
  expect(effectPreviewProgress(0.2, 2)).toBe(0.2);
  const catalog = await readValidAnimationCatalog(),
    entry = catalog.documents[0]!;
  expect(effectPosterKey(entry)).toBe(effectPosterKey({ ...entry }));
  expect(effectPosterKey(entry)).not.toBe(effectPosterKey({ ...entry, sha256: 'b'.repeat(64) }));
});
it('keys each localized style independently of unrelated user presets', async () => {
  const catalog = await readValidAnimationCatalog(),
    entry = { ...catalog.documents[0]!, previewPresetId: 'midnight-amber' };
  expect(effectPosterKey(entry, 'en')).not.toBe(effectPosterKey(entry, 'ru'));
  expect(effectPosterKey(entry)).not.toBe(
    effectPosterKey({ ...entry, previewPresetId: 'midnight-blue' })
  );
  expect(effectPosterKey(entry)).toBe(
    effectPosterKey({
      ...entry,
      presetPreferences: { presets: [{ id: 'other', name: 'Other', values: {} }] },
    })
  );
});
it('invalidates covers after source, default preset or selected values change', async () => {
  const catalog = await readValidAnimationCatalog();
  const entry = {
    ...catalog.documents[0]!,
    presetPreferences: {
      defaultPreset: { kind: 'user' as const, id: 'custom' },
      presets: [{ id: 'custom', name: 'Custom', values: { opacity: 20 } }],
    },
  };
  const key = effectPosterKey(entry);
  expect(effectPosterKey({ ...entry, sha256: 'b'.repeat(64) })).not.toBe(key);
  expect(
    effectPosterKey({
      ...entry,
      presetPreferences: {
        ...entry.presetPreferences,
        presets: [{ id: 'custom', name: 'Custom', values: { opacity: 80 } }],
      },
    })
  ).not.toBe(key);
  expect(effectPosterKey({ ...entry, previewPresetId: 'midnight-amber' })).not.toBe(key);
  expect(effectPosterKey({ ...entry, presetPreferences: { presets: [] } })).not.toBe(key);
});
