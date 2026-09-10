import { expect, it, vi } from 'vitest';
import { createEffectCatalogEntry } from '../../composition/persistence/effect-bundles/catalog-builder';
import { readValidBundleArtifact } from '../../composition/persistence/effect-bundles/fixture.test-support';
import { type EffectRuntimeRenderCommand } from '../../contracts/effect-runtime/types';
import { renderEffectCatalogPreview } from './effect-catalog-preview';

it('materializes only the selected effect assets and returns caller-owned output', async () => {
  const catalog = await createEffectCatalogEntry(await readValidBundleArtifact(), 1);
  const document = catalog.documents.find((document) => document.kind === 'standalone')!;
  const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
  const renderFrame = vi.fn(async (command: EffectRuntimeRenderCommand) => {
    const { materializeImmutablePayloads, ...fields } = command;
    const immutable = await materializeImmutablePayloads();
    expect(immutable.documentSource).toBe(document.source);
    expect(immutable.assets.map((asset) => asset.id)).toEqual(
      document.assets
        .filter(
          (reference) =>
            catalog.assets.find((asset) => asset.sha256 === reference.sha256)?.kind !== 'audio'
        )
        .map((reference) => reference.id)
    );
    expect(command.inputFrames).toEqual({});
    return {
      ...fields,
      kind: 'frame' as const,
      bitmap,
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

it('provides target and transition inputs and releases them when rendering fails', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseEffectV1Source } = await import('@sniptale/runtime-contracts/effect-v1');
  const catalog = await createEffectCatalogEntry(await readValidBundleArtifact(), 1);
  const close = vi.fn();
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return { fillRect() {}, beginPath() {}, arc() {}, fill() {} };
      }
      transferToImageBitmap() {
        return { close };
      }
    }
  );
  try {
    for (const name of ['neutral-target-effect', 'neutral-transition']) {
      const source = readFileSync(
        `packages/runtime-contracts/src/effect-v1/fixtures/valid/${name}.sniptale-effect.json`,
        'utf8'
      );
      const document = parseEffectV1Source(source).document!;
      const entry = {
        ...catalog.documents[0]!,
        id: document.id,
        kind: document.kind,
        source,
        assets: [],
      };
      const renderFrame = vi.fn(async () => {
        throw new Error('sandbox unavailable');
      });
      await expect(
        renderEffectCatalogPreview({ renderFrame, dispose: vi.fn() }, catalog, entry, 0.25, 1)
      ).rejects.toThrow('sandbox unavailable');
      expect(renderFrame).toHaveBeenCalledOnce();
    }
    expect(close).toHaveBeenCalledTimes(3);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('gives long entrance/exit animations scrub space while keeping transitions linear', async () => {
  const { effectPreviewProgress, effectPosterKey } = await import('./effect-catalog-preview');
  expect(effectPreviewProgress(0.2, 10, 'standalone')).toBeCloseTo(0.05);
  expect(effectPreviewProgress(0.8, 10, 'standalone')).toBeCloseTo(0.95);
  expect(effectPreviewProgress(0.2, 10, 'transition')).toBe(0.2);
  const catalog = await createEffectCatalogEntry(await readValidBundleArtifact(), 1);
  const entry = catalog.documents[0]!;
  expect(effectPosterKey(entry)).toBe(effectPosterKey({ ...entry }));
  expect(effectPosterKey(entry)).not.toBe(
    effectPosterKey({ ...entry, assets: [{ id: 'replacement', sha256: 'b'.repeat(64) }] })
  );
});

it('keys each localized style independently of unrelated user presets', async () => {
  const { readFileSync } = await import('node:fs');
  const { effectPosterKey } = await import('./effect-catalog-preview');
  const source = readFileSync(
    'packages/runtime-contracts/src/effect-v1/fixtures/collection/sniptale-callout.sniptale-effect.json',
    'utf8'
  );
  const catalog = await createEffectCatalogEntry(await readValidBundleArtifact(), 1);
  const entry = { ...catalog.documents[0]!, source, previewPresetId: 'sniptale-orange-light' };
  expect(effectPosterKey(entry, 'en')).not.toBe(effectPosterKey(entry, 'ru'));
  expect(effectPosterKey(entry)).not.toBe(
    effectPosterKey({ ...entry, previewPresetId: 'sniptale-orange-dark' })
  );
  expect(effectPosterKey(entry)).toBe(
    effectPosterKey({
      ...entry,
      presetPreferences: { presets: [{ id: 'other', name: 'Other', values: {} }] },
    })
  );
});
