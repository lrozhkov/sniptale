import type { VideoEditorEffectsLibraryDockProps } from './types';
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AnnotationSourcePreview } from './source-preview';
import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
vi.mock('../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('../../../ui/effect-catalog-preview', async (original) => ({
  ...(await original<typeof import('../../../ui/effect-catalog-preview')>()),
  EffectCatalogPreview: ({ progress }: { progress?: number }) => (
    <output data-progress={progress} />
  ),
}));
const source = readFileSync(
  'packages/runtime-contracts/src/effect-v1/fixtures/collection/sniptale-callout.sniptale-effect.json',
  'utf8'
);
const catalog: EffectBundleCatalogEntry = {
  packId: 'raw.callout',
  documents: [
    {
      id: 'sniptale-callout',
      kind: 'standalone',
      source,
      sha256: 'a'.repeat(64),
      schemaVersion: 'sniptale.effect.v1',
      assets: [],
      previewPresetId: 'sniptale-orange-light',
    },
  ],
  assets: [],
  enabled: true,
  label: { en: 'Callout', ru: 'Выноска' },
  description: { en: '', ru: '' },
  source: 'raw-json',
  sourceSha256: 'a'.repeat(64),
  retainedByteLength: source.length,
  createdAt: 0,
  updatedAt: 0,
  version: '1',
};
let dispose = () => {};
afterEach(() => {
  dispose();
  vi.useRealTimers();
});
it('previews without editing the project and applies the chosen time, track and style', async () => {
  vi.useFakeTimers();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  dispose = () => {
    act(() => root.unmount());
    host.remove();
  };
  const onApplyEffect = vi.fn<VideoEditorEffectsLibraryDockProps['onApplyEffect']>(
      async () => null
    ),
    onClose = vi.fn();
  const run = vi.fn(async (_kind: unknown, action: () => Promise<unknown>) => {
    await action();
  });
  await act(async () =>
    root.render(
      <AnnotationSourcePreview
        catalogs={[]}
        currentTime={3}
        appendTime={8}
        errorCode={null}
        isLoading={false}
        isOpen
        operations={{ disabled: false, operationError: null, run }}
        onApplyEffect={onApplyEffect}
        onDeleteEffectBundle={vi.fn()}
        onImportEffectFiles={vi.fn()}
        onSetEffectBundleEnabled={vi.fn()}
        selectedClipId={null}
        selectedTransitionId={null}
        selectedTrackId="track"
        catalog={catalog}
        document={catalog.documents[0]!}
        disabled={false}
        onClose={onClose}
        run={run}
      />
    )
  );
  const button = (name: string) =>
    [...host.querySelectorAll('button')].find((b) => b.title === name || b.textContent === name)!;
  const change = (input: HTMLInputElement, value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  const duration = host.querySelector<HTMLInputElement>('input[type=number]')!;
  change(duration, '0');
  expect(duration.value).toBe('4');
  change(duration, '1');
  expect(duration.value).toBe('1');
  act(() => button('videoEditor.effectsLibrary.previewPlay').click());
  act(() => vi.advanceTimersByTime(500));
  expect(Number(host.querySelector('output')!.dataset['progress'])).toBeGreaterThan(0);
  act(() => button('videoEditor.effectsLibrary.previewPause').click());
  const paused = host.querySelector('output')!.dataset['progress'];
  act(() => vi.advanceTimersByTime(500));
  expect(host.querySelector('output')!.dataset['progress']).toBe(paused);
  change(host.querySelector<HTMLInputElement>('input[type=range]')!, '0.8');
  expect(host.querySelector('output')!.dataset['progress']).toBe('0.8');
  act(() => button('videoEditor.effectsLibrary.previewPlay').click());
  act(() => vi.advanceTimersByTime(500));
  expect(host.querySelector('output')!.dataset['progress']).toBe('1');
  act(() => button('videoEditor.effectsLibrary.previewPlay').click());
  expect(host.querySelector('output')!.dataset['progress']).toBe('0');
  expect(onApplyEffect).not.toHaveBeenCalled();
  await act(async () => button('videoEditor.effectsLibrary.applyToScene').click());
  await act(async () => button('videoEditor.app.materialsAppend').click());
  expect(onApplyEffect.mock.calls.map((call) => call[0])).toEqual([
    expect.objectContaining({
      startTime: 3,
      standaloneDuration: 1,
      trackId: 'track',
      controlPresetId: 'sniptale-orange-light',
    }),
    expect.objectContaining({ startTime: 8, standaloneDuration: 1 }),
  ]);
  act(() => button('videoEditor.effectsLibrary.backToCatalog').click());
  expect(onClose).toHaveBeenCalledOnce();
});
