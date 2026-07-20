import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  createEffectRuntimeWorkerExecutionState,
  executeEffectRuntimeWorkerRequest,
} from './execute';
import { createPassContext } from './interpreter/support.test-support';
import {
  createEffectRuntimeSvgWorkerTestRequest,
  createEffectRuntimeWorkerTestRequest,
  FakeImageBitmap,
  FakeOffscreenCanvas,
} from './execute.test-support';

beforeEach(() => {
  vi.stubGlobal('ImageBitmap', FakeImageBitmap);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('runs only the validated declarative graph and transfers an exact-size bitmap', async () => {
  const result = await executeEffectRuntimeWorkerRequest(createEffectRuntimeWorkerTestRequest(), {
    createCanvas: (width, height) => new FakeOffscreenCanvas(width, height),
  });

  expect(result).toMatchObject({
    effectInstanceId: 'instance-1',
    height: 720,
    kind: 'frame',
    requestId: 'request-1',
    sequenceId: 1,
    snapshotId: `effect:${'c'.repeat(64)}`,
    width: 1280,
  });
});

it('renders a smaller physical preview bitmap in the unchanged logical coordinate system', async () => {
  const request = createEffectRuntimeWorkerTestRequest();
  request.renderHeight = 360;
  request.renderWidth = 640;
  const canvases: FakeOffscreenCanvas[] = [];

  const result = await executeEffectRuntimeWorkerRequest(request, {
    createCanvas: (width, height) => {
      const canvas = new FakeOffscreenCanvas(width, height);
      canvases.push(canvas);
      return canvas;
    },
  });

  expect(result).toMatchObject({ height: 360, kind: 'frame', width: 640 });
  expect(canvases[0]).toMatchObject({ height: 360, width: 640 });
  expect(canvases[0]!.context.setTransform).toHaveBeenCalledWith(0.5, 0, 0, 0.5, 0, 0);
});

it('renders a bounded supersampled bitmap in the unchanged logical coordinate system', async () => {
  const request = createEffectRuntimeWorkerTestRequest();
  request.renderHeight = 1440;
  request.renderWidth = 2560;
  const canvases: FakeOffscreenCanvas[] = [];

  const result = await executeEffectRuntimeWorkerRequest(request, {
    createCanvas: (width, height) => {
      const canvas = new FakeOffscreenCanvas(width, height);
      canvases.push(canvas);
      return canvas;
    },
  });

  expect(result).toMatchObject({ height: 1440, kind: 'frame', width: 2560 });
  expect(canvases[0]).toMatchObject({ height: 1440, width: 2560 });
  expect(canvases[0]!.context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
});

it('reuses acknowledged immutable refs and a keyed canvas in one persistent worker', async () => {
  const createCanvas = vi.fn(
    (width: number, height: number) => new FakeOffscreenCanvas(width, height)
  );
  const state = createEffectRuntimeWorkerExecutionState({ createCanvas });
  const first = createEffectRuntimeWorkerTestRequest();

  await expect(state.execute(first)).resolves.toMatchObject({ kind: 'frame' });
  await expect(
    state.execute({
      ...first,
      assetSelectionRef: { id: first.assetSelectionRef.id },
      documentRef: { id: first.documentRef.id },
      requestId: 'request-2',
    })
  ).resolves.toMatchObject({ kind: 'frame' });

  expect(createCanvas).toHaveBeenCalledOnce();
  expect(state.snapshot()).toEqual({
    assets: { bytes: 0, entries: 0, selections: 1 },
    canvases: { entries: 1, leases: 0 },
    models: { entries: 1 },
  });
  state.dispose();
  expect(state.snapshot()).toEqual({
    assets: { bytes: 0, entries: 0, selections: 0 },
    canvases: { entries: 0, leases: 0 },
    models: { entries: 0 },
  });
});

it('reports which immutable worker ref is absent without retaining transient inputs', async () => {
  const state = createEffectRuntimeWorkerExecutionState({
    createCanvas: (width, height) => new FakeOffscreenCanvas(width, height),
  });
  const request = createEffectRuntimeWorkerTestRequest();
  await expect(
    state.execute({
      ...request,
      assetSelectionRef: { id: request.assetSelectionRef.id },
      documentRef: { id: request.documentRef.id },
    })
  ).resolves.toMatchObject({ code: 'cacheMiss', missingRef: 'document' });
  await expect(
    state.execute({
      ...request,
      assetSelectionRef: { id: request.assetSelectionRef.id },
    })
  ).resolves.toMatchObject({ code: 'cacheMiss', missingRef: 'assetSelection' });
  state.dispose();
});

it('closes successful input frames per request instead of retaining them in worker caches', async () => {
  const state = createEffectRuntimeWorkerExecutionState({
    createCanvas: (width, height) => new FakeOffscreenCanvas(width, height),
  });
  const request = createEffectRuntimeWorkerTestRequest();
  request.documentRef.document!.kind = 'targetEffect';
  request.documentRef.document!.program.commands = [
    { height: 720, input: 'source', op: 'image', width: 1280, x: 0, y: 0 },
  ];
  const firstInput = new FakeImageBitmap(1280, 720);
  request.inputFrames = {
    source: { bitmap: firstInput, height: 720, width: 1280 },
  };
  await expect(state.execute(request)).resolves.toMatchObject({ kind: 'frame' });
  expect(firstInput.close).toHaveBeenCalledOnce();

  const secondInput = new FakeImageBitmap(1280, 720);
  await expect(
    state.execute({
      ...request,
      assetSelectionRef: { id: request.assetSelectionRef.id },
      documentRef: { id: request.documentRef.id },
      inputFrames: {
        source: { bitmap: secondInput, height: 720, width: 1280 },
      },
      requestId: 'request-2',
    })
  ).resolves.toMatchObject({ kind: 'frame' });
  expect(secondInput.close).toHaveBeenCalledOnce();
  expect(state.snapshot()).toMatchObject({
    assets: { entries: 0, selections: 1 },
    models: { entries: 1 },
  });
  state.dispose();
});

it('fails closed and closes input bitmaps when the worker envelope is malformed', async () => {
  const bitmap = new FakeImageBitmap(1280, 720);
  const malformed = { ...createEffectRuntimeWorkerTestRequest(), extra: { bitmap } };

  await expect(
    executeEffectRuntimeWorkerRequest(malformed, {
      createCanvas: (width, height) => new FakeOffscreenCanvas(width, height),
    })
  ).resolves.toMatchObject({ code: 'malformed', kind: 'error' });
  expect(bitmap.close).toHaveBeenCalledOnce();
});

it('enforces live and aggregate canvas limits inside the worker', async () => {
  const request = createEffectRuntimeWorkerTestRequest();
  request.documentRef.document!.program.commands = [
    ...Array.from({ length: 8 }, (_value, index) => ({
      commands: [{ op: 'clear' as const }],
      height: 720,
      id: `pass-${index}`,
      op: 'renderPass' as const,
      width: 1280,
    })),
    ...Array.from({ length: 8 }, (_value, index) => ({
      op: 'compositePass' as const,
      passId: `pass-${index}`,
    })),
  ];

  await expect(
    executeEffectRuntimeWorkerRequest(request, {
      createCanvas: (width, height) => new FakeOffscreenCanvas(width, height),
    })
  ).resolves.toMatchObject({ code: 'resourceLimit', kind: 'error' });
});

it('rejects unavailable SVG paths and malformed physical/output canvases', async () => {
  const svgRequest = createEffectRuntimeWorkerTestRequest();
  svgRequest.documentRef.document!.assets = [
    {
      byteLength: 1,
      id: 'logo',
      kind: 'svg',
      mimeType: 'image/svg+xml',
      path: 'runtime-assets/logo',
      sha256: 'a'.repeat(64),
    },
  ];
  svgRequest.documentRef.document!.program.commands = [
    { assetId: 'logo', height: 1, op: 'svgParts', width: 1, x: 0, y: 0 },
  ];
  svgRequest.assetSelectionRef.assets = {
    logo: {
      cacheKey: 'a'.repeat(64),
      height: 1,
      id: 'logo',
      kind: 'svg',
      mimeType: 'image/svg+xml',
      svgVector: { height: 1, parts: [], width: 1 },
      width: 1,
    },
  };
  await expect(
    executeEffectRuntimeWorkerRequest(svgRequest, {
      createCanvas: (width, height) => new FakeOffscreenCanvas(width, height),
    })
  ).resolves.toMatchObject({ code: 'outputRejected' });

  const request = createEffectRuntimeWorkerTestRequest();
  await expect(
    executeEffectRuntimeWorkerRequest(request, {
      createCanvas: () => new FakeOffscreenCanvas(1, 1),
    })
  ).resolves.toMatchObject({ code: 'outputRejected' });
  await expect(
    executeEffectRuntimeWorkerRequest(request, {
      createCanvas: (width, height) => ({
        getContext: () => createPassContext(),
        height,
        width,
      }),
    })
  ).resolves.toMatchObject({ code: 'outputRejected' });
});

it('clears hydrated SVG paths after every request in the persistent worker', async () => {
  const hydratedPaths: string[] = [];
  class FakePath2D {
    constructor(source: string) {
      hydratedPaths.push(source);
    }
  }
  vi.stubGlobal('Path2D', FakePath2D);
  const request = createEffectRuntimeSvgWorkerTestRequest();
  const dependencies = {
    createCanvas: (width: number, height: number) => new FakeOffscreenCanvas(width, height),
  };

  await expect(executeEffectRuntimeWorkerRequest(request, dependencies)).resolves.toMatchObject({
    kind: 'frame',
  });
  await expect(
    executeEffectRuntimeWorkerRequest({ ...request, requestId: 'request-2' }, dependencies)
  ).resolves.toMatchObject({ kind: 'frame' });
  expect(hydratedPaths).toEqual(['M0 0L10 10', 'M0 0L10 10']);
});

it('uses the default canvas factory and closes a rejected output bitmap', async () => {
  class WrongBitmapCanvas extends FakeOffscreenCanvas {
    override transferToImageBitmap(): ImageBitmap {
      return new FakeImageBitmap(1, 1);
    }
  }
  vi.stubGlobal('OffscreenCanvas', WrongBitmapCanvas);

  await expect(
    executeEffectRuntimeWorkerRequest(createEffectRuntimeWorkerTestRequest())
  ).resolves.toMatchObject({
    code: 'outputRejected',
  });
});
