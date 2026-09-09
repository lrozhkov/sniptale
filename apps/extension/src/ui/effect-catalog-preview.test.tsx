// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createEffectCatalogEntry } from '../composition/persistence/effect-bundles/catalog-builder';
import { readValidBundleArtifact } from '../composition/persistence/effect-bundles/fixture.test-support';
import type {
  EffectRuntimeFrameResult,
  EffectRuntimeRenderCommand,
} from '../contracts/effect-runtime/types';
const mocks = vi.hoisted(() => ({ render: vi.fn(), dispose: vi.fn() }));
vi.mock('../workflows/video/effect-runtime-sandbox', async (original) => ({
  ...(await original<typeof import('../workflows/video/effect-runtime-sandbox')>()),
  createEffectRuntimeSandboxExecutor: () => ({ renderFrame: mocks.render, dispose: mocks.dispose }),
}));
import { EffectCatalogPreview, EffectCatalogPreviewProvider } from './effect-catalog-preview';

it('uses canonical sandbox identity, serializes renders and closes late frames after unmount', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Blob', NodeBlob);
  const observers: Array<() => void> = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
        observers.push(() => callback([{ isIntersecting: true }]));
      }
      observe() {}
      disconnect() {}
    }
  );
  const catalog = await createEffectCatalogEntry(await readValidBundleArtifact(), 1);
  const entry = catalog.documents.find((document) => document.kind === 'standalone')!;
  let finish!: (value: EffectRuntimeFrameResult) => void;
  mocks.render.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <EffectCatalogPreviewProvider>
          <EffectCatalogPreview catalog={catalog} document={entry} />
        </EffectCatalogPreviewProvider>
      )
    );
    await act(async () => observers.forEach((invoke) => invoke()));
    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledOnce());
    const command: EffectRuntimeRenderCommand = mocks.render.mock.calls[0]![0];
    expect(command.snapshotId).toBe(`effect:${entry.sha256}`);
    expect(command.documentRef.id).toBe(entry.sha256);
    expect((await command.materializeImmutablePayloads()).documentSource).toBe(entry.source);
    act(() => root.unmount());
    const close = vi.fn();
    await act(async () =>
      finish({
        ...command,
        kind: 'frame',
        acknowledged: {
          documentId: command.documentRef.id,
          assetSelectionId: command.assetSelectionRef.id,
        },
        bitmap: { close, width: 320, height: 180 } as unknown as ImageBitmap,
      })
    );
    expect(close).toHaveBeenCalledOnce();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('draws visible posters, scrubs and recovers after a failed frame without changing the document', async () => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Blob', NodeBlob);
  let observe!: () => void;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
        observe = () => callback([{ isIntersecting: true }]);
      }
      observe() {}
      disconnect() {}
    }
  );
  const draw = vi.fn();
  const context = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue({ drawImage: draw } as unknown as CanvasRenderingContext2D);
  const catalog = await createEffectCatalogEntry(await readValidBundleArtifact(), 1);
  const entry = catalog.documents[0]!;
  const close = vi.fn();
  mocks.render.mockImplementation(async (command: EffectRuntimeRenderCommand) => ({
    ...command,
    kind: 'frame',
    bitmap: { close, width: 320, height: 180 },
  }));
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <EffectCatalogPreviewProvider>
          <EffectCatalogPreview catalog={catalog} document={entry} />
        </EffectCatalogPreviewProvider>
      )
    );
    await act(async () => observe());
    await vi.waitFor(() => expect(draw).toHaveBeenCalledOnce());
    const canvas = container.querySelector('canvas')!;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 320 } as DOMRect);
    mocks.render.mockRejectedValueOnce(new Error('unavailable'));
    act(() => canvas.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 40 })));
    await vi.waitFor(() => expect(canvas.style.display).toBe('none'));
    act(() => canvas.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 160 })));
    await vi.waitFor(() => expect(canvas.style.display).toBe(''));
    expect(close).toHaveBeenCalledTimes(2);
  } finally {
    act(() => root.unmount());
    context.mockRestore();
    vi.unstubAllGlobals();
  }
});
