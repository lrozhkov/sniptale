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
const mocks = vi.hoisted(() => ({
  render: vi.fn(),
  dispose: vi.fn(),
  load: vi.fn().mockResolvedValue(null),
}));
vi.mock('../composition/persistence/video-preview-cache/effect-posters', () => ({
  createEffectPosterStore: () => ({ load: mocks.load, begin: async () => null }),
}));
vi.mock('../workflows/video/effect-runtime-sandbox', async (original) => ({
  ...(await original<typeof import('../workflows/video/effect-runtime-sandbox')>()),
  createEffectRuntimeSandboxExecutor: () => ({ renderFrame: mocks.render, dispose: mocks.dispose }),
}));
import { EffectCatalogPreview, EffectCatalogPreviewProvider } from './effect-catalog-preview';

it.each([false, true])(
  'uses canonical sandbox identity and closes late frames (controlled=%s)',
  async (controlled) => {
    mocks.render.mockClear();
    mocks.dispose.mockClear();
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
            <EffectCatalogPreview
              catalog={catalog}
              document={entry}
              {...(controlled ? { progress: 0.25 } : {})}
            />
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
  }
);

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
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: draw,
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
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
    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(2));
    expect(canvas.style.display).toBe('');
    act(() => canvas.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 160 })));
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(2));
    expect(canvas.style.display).toBe('');
  } finally {
    act(() => root.unmount());
    context.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('restores a persisted cover without starting a renderer and ignores catalog identity changes', async () => {
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
  const close = vi.fn();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 320, height: 180, close }))
  );
  const draw = vi.fn();
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: draw,
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  mocks.load.mockResolvedValue(new Blob(['cover'], { type: 'image/webp' }));
  const catalog = await createEffectCatalogEntry(await readValidBundleArtifact(), 1);
  const entry = catalog.documents[0]!;
  const host = document.createElement('div');
  const root = createRoot(host);
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
    await act(async () =>
      root.render(
        <EffectCatalogPreviewProvider>
          <EffectCatalogPreview catalog={{ ...catalog }} document={{ ...entry }} />
        </EffectCatalogPreviewProvider>
      )
    );
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(mocks.render).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    mocks.render.mockImplementation(async (command: EffectRuntimeRenderCommand) => ({
      ...command,
      kind: 'frame',
      bitmap: { width: 320, height: 180, close: vi.fn() },
    }));
    const canvas = host.querySelector('canvas')!;
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, clientX: 80 }));
      canvas.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 80 }));
    });
    await vi.waitFor(() => expect(mocks.render.mock.calls.length).toBeGreaterThan(1));
  } finally {
    act(() => root.unmount());
    context.mockRestore();
    mocks.load.mockResolvedValue(null);
    vi.unstubAllGlobals();
  }
});

it('restores a catalog on each mount without entering a blocked renderer queue', async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Blob', NodeBlob);
  const { createEffectPreviewSession } = await import('./effect-catalog-preview-session');
  const catalog = await createEffectCatalogEntry(await readValidBundleArtifact(), 1);
  const draw = vi.fn();
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: draw,
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  const close = vi.fn();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 320, height: 180, close }))
  );
  mocks.load.mockResolvedValue(new Blob(['cover'], { type: 'image/webp' }));
  const enqueue = vi.fn();
  try {
    for (let mount = 0; mount < 2; mount++) {
      const sessions = Array.from({ length: 12 }, (_, index) =>
        createEffectPreviewSession({
          target: document.createElement('canvas'),
          queue: { enqueue },
          key: `cover-${index}`,
          readDocument: () => ({ catalog, entry: catalog.documents[0]! }),
          readSource: () => null,
        })
      );
      sessions.forEach((session) => session.render(0.5, true));
      await vi.waitFor(() => expect(draw).toHaveBeenCalledTimes((mount + 1) * 12));
      sessions.forEach((session) => session.dispose());
    }
    expect(enqueue).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(24);
  } finally {
    context.mockRestore();
    mocks.load.mockResolvedValue(null);
    vi.unstubAllGlobals();
  }
});

it.each(['missing', 'unavailable', 'corrupt'])(
  'renders a replacement when the poster is %s',
  async (failure) => {
    const { createEffectPreviewSession } = await import('./effect-catalog-preview-session');
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('Blob', NodeBlob);
    const catalog = await createEffectCatalogEntry(await readValidBundleArtifact(), 1);
    const entry = catalog.documents.find((document) => document.kind === 'standalone')!;
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    mocks.load.mockReset();
    if (failure === 'unavailable') mocks.load.mockRejectedValue(new Error('storage unavailable'));
    else mocks.load.mockResolvedValue(failure === 'corrupt' ? new Blob(['invalid']) : null);
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')));
    const close = vi.fn();
    const renderFrame = vi.fn(async (command: EffectRuntimeRenderCommand) => ({
      ...command,
      kind: 'frame' as const,
      bitmap: { width: 320, height: 180, close } as unknown as ImageBitmap,
      acknowledged: {
        documentId: command.documentRef.id,
        assetSelectionId: command.assetSelectionRef.id,
      },
    }));
    const enqueue = vi.fn(
      (task: Parameters<import('./effect-catalog-preview-session').PreviewQueue['enqueue']>[0]) => {
        void task(() => ({ renderFrame, dispose: vi.fn() }));
      }
    );
    const target = document.createElement('canvas');
    const session = createEffectPreviewSession({
      target,
      queue: { enqueue },
      key: failure,
      readDocument: () => ({ catalog, entry }),
      readSource: () => null,
    });
    try {
      session.render(0.5, true);
      await vi.waitFor(() => expect(target.dataset['previewState']).toBe('ready'));
      expect(enqueue).toHaveBeenCalledOnce();
      expect(renderFrame).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
    } finally {
      session.dispose();
      context.mockRestore();
      mocks.load.mockResolvedValue(null);
      vi.unstubAllGlobals();
    }
  }
);

it('releases a restored bitmap if the preview is disposed during decoding', async () => {
  const { createEffectPreviewSession } = await import('./effect-catalog-preview-session');
  const cover = new Blob(['cover']);
  mocks.load.mockResolvedValue(cover);
  let finish!: (bitmap: ImageBitmap) => void;
  const decode = vi.fn(
    () =>
      new Promise<ImageBitmap>((resolve) => {
        finish = resolve;
      })
  );
  vi.stubGlobal('createImageBitmap', decode);
  const enqueue = vi.fn();
  const target = document.createElement('canvas');
  const session = createEffectPreviewSession({
    target,
    queue: { enqueue },
    key: 'disposed',
    readDocument: () => {
      throw new Error('Cached covers do not resolve documents');
    },
    readSource: () => null,
  });
  try {
    session.render(0.5, true);
    await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce());
    session.dispose();
    const close = vi.fn();
    finish({ width: 320, height: 180, close } as unknown as ImageBitmap);
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(target.dataset['previewState']).toBeUndefined();
    expect(enqueue).not.toHaveBeenCalled();
  } finally {
    session.dispose();
    mocks.load.mockResolvedValue(null);
    vi.unstubAllGlobals();
  }
});
