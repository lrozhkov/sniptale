// @vitest-environment jsdom
import { Canvas } from 'fabric';
import { expect, it, vi } from 'vitest';
import type { RasterTarget, RasterTargetAdapter } from './adapters';
import type { BackgroundRasterCandidate } from '../controller/background/sync';
import type { RasterComputeCommand, RasterComputeValue } from './compute';
import {
  getEditorRasterRuntime,
  mountEditorRasterRuntime,
  unmountEditorRasterRuntime,
} from './runtime';
it('scopes the mounted owner to its Canvas and disposes all old resources on remount', async () => {
  const canvas = new Canvas(undefined, { width: 10, height: 10, renderOnAddRemove: false }),
    other = new Canvas(undefined, { width: 10, height: 10, renderOnAddRemove: false });
  const adapter: RasterTargetAdapter = {
    prepareBackgroundCorrection: async () => {
      throw new Error('unused correction');
    },
    prepareNativeCorrectionPreview: async () => null,
    prepareCorrectionPreview: async () => null,
    publishCorrection: async () => false,
    resolve: () => null,
    resolveById: () => null,
    hydrateTarget: async () => {},
    isCurrent: () => false,
    publish: async () => false,
    copy: async () => false,
    allowContentEditing: () => false,
    flip: async () => false,
    preparePreview: async () => null,
  };
  const compute = { run: vi.fn(), cancel: vi.fn(), dispose: vi.fn() };
  const first = mountEditorRasterRuntime({ canvas, adapter, createCompute: () => compute });
  expect(getEditorRasterRuntime(canvas)).toBe(first);
  expect(getEditorRasterRuntime(other)).toBe(null);
  expect(compute.run).not.toHaveBeenCalled();
  const second = mountEditorRasterRuntime({
    canvas,
    adapter,
    createCompute: () => ({ run: vi.fn(), cancel: vi.fn(), dispose: vi.fn() }),
  });
  expect(compute.dispose).toHaveBeenCalledOnce();
  expect(getEditorRasterRuntime(canvas)).toBe(second);
  first.dispose();
  expect(getEditorRasterRuntime(canvas)).toBe(second);
  unmountEditorRasterRuntime(canvas);
  expect(getEditorRasterRuntime(canvas)).toBe(null);
  await canvas.dispose();
  await other.dispose();
});

async function backgroundRuntimeFixture() {
  const { FabricImage } = await import('fabric');
  const { createRasterTargetAdapter } = await import('./adapters');
  const { createEditorRasterMetadata } = await import('./image-state');
  const { DEFAULT_EDITOR_FRAME_SETTINGS, DEFAULT_BROWSER_FRAME_STATE } =
    await import('../../features/editor/document/constants');
  const { prepareEditorBackgroundLayer } = await import('../controller/background/sync');
  const { applyEditorFrameSceneSettings } =
    await import('../controller/public-actions/scene/resize/frame');
  const bitmap = document.createElement('canvas');
  bitmap.width = bitmap.height = 4;
  const brush = bitmap.getContext('2d')!;
  brush.fillStyle = 'red';
  brush.fillRect(0, 0, 4, 4);
  const original = bitmap.toDataURL();
  brush.fillStyle = 'blue';
  brush.fillRect(0, 0, 4, 4);
  const blue = bitmap.toDataURL();
  const initial = new FabricImage(bitmap, {
    originX: 'left',
    originY: 'top',
    scaleX: 5,
    scaleY: 5,
  });
  initial.sniptaleId = 'background';
  initial.sniptaleType = 'background';
  initial.sniptaleRole = 'background';
  initial.sniptaleBackgroundMode = 'image';
  initial.sniptaleBackgroundImageData = original;
  initial.sniptaleContentLocked = false;
  const metadata = createEditorRasterMetadata(original, 4, 4);
  Object.assign(initial, metadata);
  const canvas = new Canvas(undefined, { width: 20, height: 20, renderOnAddRemove: false });
  canvas.add(initial);
  canvas.setActiveObject(initial);
  let frame = {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    backgroundMode: 'image' as const,
    backgroundImageFit: 'stretch' as const,
    backgroundImageData: original,
  };
  const history = vi.fn(),
    events: string[] = [];
  for (const name of [
    'selection:cleared',
    'selection:created',
    'object:removed',
    'object:added',
  ] as const)
    canvas.on(name, () => {
      events.push(name);
    });
  const loaded = vi
    .spyOn(FabricImage, 'fromURL')
    .mockImplementation(async () => new FabricImage(bitmap));
  const refusal = { enabled: false, observerThrows: false };
  const adapter = createRasterTargetAdapter({
    canvas: () => canvas,
    frame: () => frame,
    documentBounds: () => ({ x: 0, y: 0, width: 20, height: 20 }),
    prepareObject: () => {},
    commitNative: vi.fn(),
    flipObject: async () => {},
    publishBackground: async (candidate, mutation) => {
      if (refusal.enabled) return false;
      if (refusal.observerThrows)
        candidate.observeReplacement = () => {
          throw new Error('controlled observer failure');
        };
      const next = { ...frame, backgroundImageData: candidate.derivedImageData };
      return applyEditorFrameSceneSettings({
        canvas,
        source: {
          id: 'source',
          dataUrl: original,
          name: null,
          intrinsicWidth: 4,
          intrinsicHeight: 4,
          displayWidth: 4,
          displayHeight: 4,
          left: 0,
          top: 0,
          visible: true,
          locked: true,
        },
        frame: next,
        backgroundCandidate: candidate,
        ...(mutation.signal ? { signal: mutation.signal } : {}),
        store: {
          getFrame: () => frame,
          getBrowserFrame: () => DEFAULT_BROWSER_FRAME_STATE,
          updateFrame: (value) => {
            frame = {
              ...value,
              backgroundMode: 'image',
              backgroundImageFit: 'stretch',
              backgroundImageData: value.backgroundImageData ?? original,
            };
          },
        },
        prepareBackground: (size) =>
          prepareEditorBackgroundLayer({
            canvas,
            canvasSize: size,
            frame: next,
            candidate,
            prepareObject: () => {},
          }),
        zoomLevel: 1,
        getCanvasDocumentSize: () => ({ width: 20, height: 20 }),
        ensureReachableObjects: () => false,
        rebuildFrameDecorations: async () => {},
        relayoutScene: () => {},
        commitHistory: history,
        syncRuntimeState: () => {},
      });
    },
  });
  const compute: import('./compute').RasterComputeClient = {
    run: vi.fn(async (command: RasterComputeCommand): Promise<RasterComputeValue> =>
      command.kind === 'decode'
        ? {
            kind: 'decoded',
            pixels: {
              width: 4,
              height: 4,
              color: new Uint8ClampedArray(64).fill(255),
              visibility: null,
              key: null,
            },
          }
        : {
            kind: 'encoded',
            candidate: {
              metadata: { ...metadata, sniptaleRasterColorData: blue },
              visibleFullDataUrl: blue,
            },
          }
    ),
    cancel: vi.fn(),
    dispose: vi.fn(),
  };
  const runtime = mountEditorRasterRuntime({ canvas, adapter, createCompute: () => compute });
  return {
    runtime,
    canvas,
    initial,
    history,
    events,
    compute,
    adapter,
    metadata,
    loaded,
    bitmap,
    refusal,
    async dispose() {
      runtime.dispose();
      loaded.mockRestore();
      await canvas.dispose();
    },
  };
}

it('keeps pixel selection and tool through its own background publication events', async () => {
  const fixture = await backgroundRuntimeFixture();
  const { runtime, events, history, canvas, initial, compute } = fixture;
  try {
    runtime.updateSettings({ tolerance: 13, color: 'rgba(10, 20, 30, 0.5)' });
    runtime.setTool('select');
    runtime.beginGesture({ x: 0, y: 0 });
    await runtime.endGesture({ x: 2, y: 4 });
    expect(runtime.getSnapshot().selection).toBe('active');
    await runtime.fillSelected();
    expect(events).toEqual([
      'selection:cleared',
      'object:removed',
      'object:added',
      'selection:created',
    ]);
    expect(history).toHaveBeenCalledOnce();
    expect(canvas.getActiveObjects()[0]).not.toBe(initial);
    expect(runtime.getSnapshot().selection).toBe('active');
    expect(runtime.getSnapshot().tool).toBe('select');
    expect(runtime.getSnapshot().settings).toMatchObject({
      tolerance: 13,
      color: 'rgba(10, 20, 30, 0.5)',
    });
    await runtime.hideSelected();
    const edits = vi
      .mocked(compute.run)
      .mock.calls.map(([command]) => command)
      .filter((command) => command.kind === 'edit');
    expect(edits).toHaveLength(2);
    expect(edits[1]?.region).toEqual(
      new Uint8Array([255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0])
    );
  } finally {
    await fixture.dispose();
  }
});

function held<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
it.each(['selection', 'same-id replacement'] as const)(
  'cancels held background preparation after external %s without restoring tool or mask',
  async (change) => {
    const { FabricImage } = await import('fabric'),
      fixture = await backgroundRuntimeFixture();
    const { runtime, canvas, loaded, bitmap, initial, metadata, history } = fixture;
    try {
      runtime.setTool('select');
      runtime.selectAll();
      const started = held<void>(),
        decode = held<InstanceType<typeof FabricImage>>();
      loaded.mockImplementationOnce(() => {
        started.resolve();
        return decode.promise;
      });
      const pending = runtime.fillSelected();
      await started.promise;
      const other = new FabricImage(bitmap, { originX: 'left', originY: 'top' });
      other.sniptaleId = change === 'selection' ? 'other' : 'background';
      other.sniptaleType = change === 'selection' ? 'image' : 'background';
      other.sniptaleRole = change === 'selection' ? 'annotation' : 'background';
      other.sniptaleBackgroundMode = 'image';
      other.sniptaleBackgroundImageData = metadata.sniptaleRasterOriginalData;
      other.sniptaleContentLocked = false;
      Object.assign(other, metadata);
      if (change === 'same-id replacement') canvas.remove(initial);
      canvas.add(other);
      canvas.setActiveObject(other);
      runtime.setTool(null);
      decode.resolve(new FabricImage(bitmap));
      await pending;
      expect(history).not.toHaveBeenCalled();
      expect(canvas.getActiveObjects()).toEqual([other]);
      expect(runtime.getSnapshot().tool).toBe(null);
      expect(runtime.getSnapshot().selection).toBe('none');
      expect(other.sniptaleRasterColorData).toBeUndefined();
    } finally {
      await fixture.dispose();
    }
  }
);
it.each(['refusal', 'observer'] as const)(
  'clears the brush preview after background %s and retries without stale replacement state',
  async (failure) => {
    const fixture = await backgroundRuntimeFixture(),
      { runtime, refusal, canvas, initial, history } = fixture;
    const acceptedRender = canvas.renderCanvas;
    try {
      runtime.setTool('erase');
      runtime.updateSettings({ tolerance: 9, brushSize: 1 });
      runtime.selectAll();
      // A native draft visibly owns the target render method until the operation settles.
      const original = initial.render;
      if (failure === 'refusal') refusal.enabled = true;
      else refusal.observerThrows = true;
      const { FabricImage } = await import('fabric');
      const white = document.createElement('canvas');
      white.width = white.height = 4;
      white.getContext('2d')!.fillStyle = 'white';
      white.getContext('2d')!.fillRect(0, 0, 4, 4);
      fixture.loaded.mockImplementation(async () => new FabricImage(white));
      const installed = held<void>(),
        encoding = held<import('./compute').RasterComputeValue>();
      const request = canvas.requestRenderAll.bind(canvas);
      const requestSpy = vi.spyOn(canvas, 'requestRenderAll').mockImplementation(() => {
        if (initial.render !== original) installed.resolve();
        return request();
      });
      const normal = vi.mocked(fixture.compute.run).getMockImplementation()!;
      vi.mocked(fixture.compute.run).mockImplementation((command, signal) =>
        command.kind === 'encode' ? encoding.promise : normal(command, signal)
      );
      runtime.beginGesture({ x: 0.5, y: 0.5 });
      const failed = runtime.endGesture({ x: 1.5, y: 0.5 });
      await installed.promise;
      canvas.renderAll();
      expect([...canvas.getContext().getImageData(17, 17, 1, 1).data]).toEqual([
        255, 255, 255, 255,
      ]);
      encoding.resolve({
        kind: 'encoded',
        candidate: {
          metadata: fixture.metadata,
          visibleFullDataUrl: fixture.metadata.sniptaleRasterOriginalData,
        },
      });
      await failed;
      requestSpy.mockRestore();
      vi.mocked(fixture.compute.run).mockImplementation(normal);
      canvas.renderAll();
      expect([...canvas.getContext().getImageData(17, 17, 1, 1).data]).toEqual([0, 0, 255, 255]);
      expect(initial.render).toBe(original);
      expect(canvas.renderCanvas).toBe(acceptedRender);
      expect(runtime.getSnapshot()).toMatchObject({
        tool: 'erase',
        selection: 'active',
        busy: false,
        error: 'compute-failed',
        settings: { tolerance: 9 },
      });
      expect(canvas.getActiveObjects()).toEqual([initial]);
      expect(history).not.toHaveBeenCalled();
      refusal.enabled = false;
      refusal.observerThrows = false;
      runtime.beginGesture({ x: 0.5, y: 0.5 });
      await runtime.endGesture({ x: 1.5, y: 0.5 });
      expect(history).toHaveBeenCalledOnce();
      expect(runtime.getSnapshot()).toMatchObject({
        tool: 'erase',
        selection: 'active',
        busy: false,
        error: null,
      });
    } finally {
      await fixture.dispose();
    }
  }
);

it('invalidates preservation for an unrelated native event inside the exact replacement bracket', async () => {
  const { Rect } = await import('fabric'),
    fixture = await backgroundRuntimeFixture(),
    { runtime, canvas, history } = fixture;
  const extra = new Rect({ width: 2, height: 2 });
  extra.sniptaleId = 'extra';
  let inserted = false;
  const stop = canvas.on('object:added', ({ target }) => {
    if (target.sniptaleId === 'background' && !inserted) {
      inserted = true;
      canvas.add(extra);
    }
  });
  try {
    runtime.setTool('select');
    runtime.selectAll();
    await runtime.fillSelected();
    expect(inserted).toBe(true);
    expect(history).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot()).toMatchObject({ tool: null, selection: 'none', busy: false });
  } finally {
    stop();
    await fixture.dispose();
  }
});

async function flipThroughInspector(fixture: Awaited<ReturnType<typeof backgroundRuntimeFixture>>) {
  const { applyEditorControllerLayerTransformation } =
    await import('../controller/public-api/layer-raster-actions/transform');
  await applyEditorControllerLayerTransformation(
    {
      canvas: fixture.canvas,
      source: null,
      setSource: vi.fn(),
      prepareObject: vi.fn(),
      sendFrameObjectsToBack: vi.fn(),
      commitHistory: fixture.history,
      syncRuntimeState: vi.fn(),
      createLayerMutationToken: () => 1,
      isLayerMutationTokenCurrent: () => true,
    },
    'background',
    'flip-horizontal'
  );
}
it.each(['decode', 'encode', 'failure'] as const)(
  'settles stale %s after the inspector flip commits without a Fabric modification event',
  async (phase) => {
    const fixture = await backgroundRuntimeFixture(),
      { runtime, compute, canvas, initial, history, metadata } = fixture;
    const normal = vi.mocked(compute.run).getMockImplementation()!,
      pendingResult = held<RasterComputeValue>(),
      installed = held<void>();
    const originalRender = initial.render,
      modified = vi.fn(),
      removeModified = canvas.on('object:modified', modified);
    const request = canvas.requestRenderAll.bind(canvas),
      requestSpy = vi.spyOn(canvas, 'requestRenderAll').mockImplementation(() => {
        if (initial.render !== originalRender) installed.resolve();
        return request();
      });
    try {
      runtime.setTool(phase === 'decode' ? 'fill' : 'erase');
      runtime.updateSettings({ brushSize: 1 });
      vi.mocked(compute.run).mockImplementation((command, signal) =>
        command.kind === (phase === 'decode' ? 'decode' : 'encode')
          ? pendingResult.promise
          : normal(command, signal)
      );
      let operation: Promise<void>;
      if (phase === 'decode') operation = runtime.fillSelected();
      else {
        runtime.beginGesture({ x: 0.5, y: 0.5 });
        operation = runtime.endGesture({ x: 1.5, y: 0.5 });
        await installed.promise;
        expect(initial.render).not.toBe(originalRender);
      }
      expect(runtime.getSnapshot().busy).toBe(true);
      await flipThroughInspector(fixture);
      expect(modified).not.toHaveBeenCalled();
      expect(initial.flipX).toBe(true);
      expect(history).toHaveBeenCalledOnce();
      if (phase === 'decode') pendingResult.resolve(await normal({ kind: 'decode', metadata }));
      else if (phase === 'encode')
        pendingResult.resolve({
          kind: 'encoded',
          candidate: { metadata, visibleFullDataUrl: metadata.sniptaleRasterOriginalData },
        });
      else pendingResult.reject(new Error('stale worker failure'));
      await operation;
      expect(runtime.getSnapshot()).toMatchObject({ busy: false, error: null });
      expect(initial.render).toBe(originalRender);
      expect(initial.flipX).toBe(true);
      expect(initial.sniptaleRasterColorData).toBeUndefined();
      expect(history).toHaveBeenCalledOnce();
      vi.mocked(compute.run).mockImplementation(normal);
      await runtime.fillSelected();
      expect(history).toHaveBeenCalledTimes(2);
      expect(canvas.getActiveObjects()[0]?.flipX).toBe(true);
      expect(runtime.getSnapshot().busy).toBe(false);
    } finally {
      requestSpy.mockRestore();
      removeModified();
      await fixture.dispose();
    }
  }
);

it.each(['reply', 'failure'] as const)(
  'does not settle a newer brush when the superseded pre-flip job returns a late %s',
  async (outcome) => {
    const fixture = await backgroundRuntimeFixture(),
      { runtime, compute, canvas, initial, history, metadata } = fixture;
    const normal = vi.mocked(compute.run).getMockImplementation()!,
      oldDecode = held<RasterComputeValue>(),
      newEncode = held<RasterComputeValue>(),
      installed = held<void>();
    let firstDecode = true;
    const original = initial.render,
      request = canvas.requestRenderAll.bind(canvas);
    const requestSpy = vi.spyOn(canvas, 'requestRenderAll').mockImplementation(() => {
      if (initial.render !== original) installed.resolve();
      return request();
    });
    try {
      vi.mocked(compute.run).mockImplementation((command, signal) => {
        if (command.kind === 'decode' && firstDecode) {
          firstDecode = false;
          return oldDecode.promise;
        }
        if (command.kind === 'encode') return newEncode.promise;
        return normal(command, signal);
      });
      runtime.setTool('fill');
      const superseded = runtime.fillSelected();
      await flipThroughInspector(fixture);
      runtime.setTool('erase');
      runtime.updateSettings({ brushSize: 1 });
      runtime.beginGesture({ x: 0.5, y: 0.5 });
      const newer = runtime.endGesture({ x: 1.5, y: 0.5 });
      await installed.promise;
      const draftRender = initial.render,
        cancellations = vi.mocked(compute.cancel).mock.calls.length;
      expect(draftRender).not.toBe(original);
      expect(runtime.getSnapshot().busy).toBe(true);
      if (outcome === 'reply') oldDecode.resolve(await normal({ kind: 'decode', metadata }));
      else oldDecode.reject(new Error('late old failure'));
      await superseded;
      expect(runtime.getSnapshot()).toMatchObject({ tool: 'erase', busy: true, error: null });
      expect(initial.render).toBe(draftRender);
      expect(compute.cancel).toHaveBeenCalledTimes(cancellations);
      expect(history).toHaveBeenCalledOnce();
      newEncode.resolve({
        kind: 'encoded',
        candidate: { metadata, visibleFullDataUrl: metadata.sniptaleRasterOriginalData },
      });
      await newer;
      expect(runtime.getSnapshot()).toMatchObject({ tool: 'erase', busy: false, error: null });
      expect(history).toHaveBeenCalledTimes(2);
      expect(canvas.getActiveObjects()[0]?.flipX).toBe(true);
    } finally {
      requestSpy.mockRestore();
      await fixture.dispose();
    }
  }
);

it.each([false, true])(
  'retains editing across history replacement and recovered failure (failure=%s)',
  async (failure) => {
    const fixture = await backgroundRuntimeFixture();
    const { FabricImage } = await import('fabric');
    const { runtime, canvas, initial, bitmap, metadata } = fixture;
    const replacement = new FabricImage(bitmap);
    Object.assign(replacement, metadata, {
      sniptaleId: initial.sniptaleId,
      sniptaleType: 'background',
      sniptaleRole: 'background',
      sniptaleBackgroundMode: 'image',
      sniptaleBackgroundImageData: initial.sniptaleBackgroundImageData,
      sniptaleContentLocked: false,
    });
    try {
      runtime.enterEditing();
      runtime.selectTool('erase');
      runtime.selectAll();
      const snapshots: boolean[] = [];
      const remove = runtime.subscribe(() => snapshots.push(runtime.getSnapshot().editing));
      const restore = runtime.preserveEditingForHistory(async () => {
        canvas.discardActiveObject();
        canvas.remove(initial);
        canvas.add(replacement);
        runtime.setTool(null);
        runtime.refresh();
        expect(runtime.getSnapshot()).toMatchObject({ editing: true, tool: 'erase', busy: true });
        expect(runtime.beginGesture({ x: 1, y: 1 })).toBe(false);
        if (failure) throw new Error('history restored its previous document');
      });
      if (failure) await expect(restore).rejects.toThrow('history restored its previous document');
      else await restore;
      remove();
      expect(snapshots).not.toContain(false);
      expect(canvas.getActiveObject()).toBe(replacement);
      expect(runtime.getSnapshot()).toMatchObject({
        editing: true,
        tool: 'erase',
        selection: 'active',
        busy: false,
      });
    } finally {
      await fixture.dispose();
    }
  }
);
it('ends editing when history removes its target instead of selecting another layer', async () => {
  const fixture = await backgroundRuntimeFixture();
  try {
    fixture.runtime.enterEditing();
    fixture.runtime.selectTool('fill');
    await fixture.runtime.preserveEditingForHistory(async () => {
      fixture.canvas.discardActiveObject();
      fixture.canvas.remove(fixture.initial);
    });
    expect(fixture.canvas.getActiveObjects()).toEqual([]);
    expect(fixture.runtime.getSnapshot()).toMatchObject({
      editing: false,
      tool: null,
      busy: false,
    });
  } finally {
    await fixture.dispose();
  }
});
it('does not reopen editing after explicit exit during a held history transition', async () => {
  const fixture = await backgroundRuntimeFixture();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    fixture.runtime.enterEditing();
    fixture.runtime.selectTool('erase');
    const pending = fixture.runtime.preserveEditingForHistory(async () => {
      await held;
    });
    fixture.runtime.finishEditing();
    release();
    await pending;
    expect(fixture.canvas.getActiveObjects()).toEqual([]);
    expect(fixture.runtime.getSnapshot()).toMatchObject({
      editing: false,
      tool: null,
      busy: false,
    });
  } finally {
    release();
    await fixture.dispose();
  }
});
it('does not override a newer selection while the history target hydrates', async () => {
  const fixture = await backgroundRuntimeFixture();
  const { FabricImage } = await import('fabric');
  const other = new FabricImage(fixture.bitmap);
  Object.assign(other, fixture.metadata, {
    sniptaleId: 'another-image',
    sniptaleType: 'image',
    sniptaleContentLocked: false,
  });
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const hydration = new Promise<void>((resolve) => {
    started = resolve;
  });
  const hydrate = vi
    .spyOn(fixture.adapter, 'hydrateTarget')
    .mockImplementation(async (_signal, id) => {
      if (id) {
        started();
        await held;
      }
    });
  try {
    fixture.runtime.enterEditing();
    fixture.runtime.selectTool('erase');
    const pending = fixture.runtime.preserveEditingForHistory(async () => {
      fixture.canvas.discardActiveObject();
      fixture.canvas.add(other);
    });
    await hydration;
    fixture.canvas.setActiveObject(other);
    release();
    await pending;
    expect(fixture.canvas.getActiveObject()).toBe(other);
    expect(fixture.runtime.getSnapshot()).toMatchObject({
      editing: false,
      targetId: 'another-image',
      tool: null,
      busy: false,
    });
  } finally {
    release();
    hydrate.mockRestore();
    await fixture.dispose();
  }
});

function correctionCandidate(target: RasterTarget): BackgroundRasterCandidate {
  return {
    targetId: target.id,
    expectedObject: target.identity,
    metadata: target.metadata,
    effects: [{ id: 'brightness', amount: 0.4, enabled: true }],
    derivedImageData: target.metadata.sniptaleRasterOriginalData,
    flipX: target.identity.flipX,
    flipY: target.identity.flipY,
  };
}

it('retains mode, tool and accepted mask through managed background correction replacement', async () => {
  const fixture = await backgroundRuntimeFixture();
  const { runtime, adapter, canvas, initial, events, history } = fixture;
  try {
    runtime.enterEditing();
    runtime.selectTool('select');
    runtime.beginGesture({ x: 0, y: 0 });
    await runtime.endGesture({ x: 2, y: 4 });
    let published = false;
    await runtime.runCorrectionPreparation('background', async (signal) => {
      const expected = adapter.resolveById('background');
      if (!expected) throw new Error('Expected correction target');
      published = await runtime.publishCorrection(expected, correctionCandidate(expected), signal);
    });
    expect(published).toBe(true);
    expect(canvas.getActiveObject()).not.toBe(initial);
    expect(canvas.getActiveObject()?.sniptaleEffects).toEqual([
      { id: 'brightness', amount: 0.4, enabled: true },
    ]);
    expect(events).toEqual([
      'selection:cleared',
      'object:removed',
      'object:added',
      'selection:created',
    ]);
    expect(runtime.getSnapshot()).toMatchObject({
      available: true,
      editing: true,
      targetId: 'background',
      tool: 'select',
      selection: 'active',
      error: null,
    });
    expect(history).toHaveBeenCalledOnce();
    await runtime.hideSelected();
    expect(history).toHaveBeenCalledTimes(2);
    expect(runtime.getSnapshot()).toMatchObject({
      editing: true,
      tool: 'select',
      selection: 'active',
    });
  } finally {
    await fixture.dispose();
  }
});

it('retains accepted raster mode and target when managed correction publication is refused', async () => {
  const fixture = await backgroundRuntimeFixture();
  const { runtime, adapter, canvas, initial, refusal, history } = fixture;
  try {
    runtime.enterEditing();
    runtime.selectTool('erase');
    refusal.enabled = true;
    let published = true;
    await runtime.runCorrectionPreparation('background', async (signal) => {
      const expected = adapter.resolveById('background');
      if (!expected) throw new Error('Expected correction target');
      published = await runtime.publishCorrection(expected, correctionCandidate(expected), signal);
    });
    expect(published).toBe(false);
    expect(canvas.getActiveObject()).toBe(initial);
    expect(runtime.getSnapshot()).toMatchObject({
      editing: true,
      targetId: 'background',
      tool: 'erase',
    });
    expect(history).not.toHaveBeenCalled();
  } finally {
    await fixture.dispose();
  }
});

it.each(['selection', 'same-id replacement', 'permission'] as const)(
  'does not retain or reselect a managed correction target after external %s',
  async (change) => {
    const fixture = await backgroundRuntimeFixture();
    const { runtime, adapter, canvas, initial, bitmap, history } = fixture;
    const { FabricImage } = await import('fabric');
    try {
      runtime.enterEditing();
      runtime.selectTool('erase');
      const started = held<void>(),
        release = held<void>();
      let published = true;
      const pending = runtime.runCorrectionPreparation('background', async (signal) => {
        const expected = adapter.resolveById('background');
        if (!expected) throw new Error('Expected correction target');
        const candidate = correctionCandidate(expected);
        started.resolve();
        await release.promise;
        published = await runtime.publishCorrection(expected, candidate, signal);
      });
      await started.promise;
      let selected = initial;
      if (change === 'permission') {
        initial.sniptaleContentLocked = true;
        runtime.refresh();
      } else {
        const next = new FabricImage(bitmap);
        next.sniptaleId = change === 'selection' ? 'other-image' : 'background';
        next.sniptaleType = change === 'selection' ? 'image' : 'background';
        next.sniptaleRole = change === 'selection' ? 'annotation' : 'background';
        next.sniptaleBackgroundMode = 'image';
        next.sniptaleContentLocked = false;
        Object.assign(next, fixture.metadata);
        if (change === 'same-id replacement') canvas.remove(initial);
        canvas.add(next);
        canvas.setActiveObject(next);
        selected = next;
      }
      release.resolve();
      await pending;
      expect(published).toBe(false);
      expect(canvas.getActiveObject()).toBe(selected);
      expect(runtime.getSnapshot().editing).toBe(false);
      expect(history).not.toHaveBeenCalled();
    } finally {
      await fixture.dispose();
    }
  }
);
