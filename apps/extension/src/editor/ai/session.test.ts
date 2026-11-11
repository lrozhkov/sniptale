import { reframeEditorRaster } from '../controller/layer-effects/rasterize/capture';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Canvas, Rect } from 'fabric';
import { crc32, deflateSync } from 'node:zlib';
import { createImageEditorSession } from './session';
import type { EditorImageSnapshot, ImageApplyController } from '../controller/ai-image/types';

vi.mock('../controller/layer-effects/rasterize/capture', () => ({ reframeEditorRaster: vi.fn() }));
vi.mock('fabric', () => ({ Canvas: class {}, Rect: class {} }));
vi.mock('../controller/ai-image/snapshot', () => ({
  captureImageEditorSnapshot: vi.fn(),
  prepareImageEditorSnapshot: vi.fn(),
}));
vi.mock('../controller/ai-image/apply', () => ({
  applyImageEditorResult: vi.fn(),
  canUpdateImageResult: () => true,
  isImageApplyResultPresent: () => true,
}));
vi.mock('./client', async (original) => ({
  ...(await original<typeof import('./client')>()),
  runImageEditorJob: vi.fn(),
}));
vi.mock('../workflows/open-generated-image-document', () => ({
  openGeneratedImageDocument: vi.fn(),
}));
const image = {
  dataUrl:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS8Mj5D8JMDFAAZwAAAAD//238wugAAAAGSURBVAMATl0DnQxeRbkAAAAASUVORK5CYII=',
  width: 2,
  height: 3,
};
function variantImage(red: number, width = 2, height = 3) {
  const original = Buffer.from(image.dataUrl.split(',')[1]!, 'base64');
  original.writeUInt32BE(width, 16);
  original.writeUInt32BE(height, 20);
  original.writeUInt32BE(crc32(original.subarray(12, 29)), 29);
  const stride = width * 4 + 1;
  const rows = Buffer.alloc(height * stride);
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      rows[row * stride + 1 + column * 4] = red;
      rows[row * stride + 4 + column * 4] = 255;
    }
  const data = deflateSync(rows);
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write('IDAT', 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return {
    ...image,
    width,
    height,
    dataUrl: `data:image/png;base64,${Buffer.concat([original.subarray(0, 33), chunk, original.subarray(-12)]).toString('base64')}`,
  };
}
const model = {
  modelId: 'model',
  modelCode: 'code',
  providerId: 'provider',
  destinationBinding: `sha256:${'a'.repeat(64)}`,
  label: 'Provider / Model',
};
function setup() {
  const canvas = new Canvas();
  const controller: ImageApplyController = {
    canvas,
    source: null,
    originalDocument: null,
    canvasDocumentSize: { width: 100, height: 100 },
    prepareObject: vi.fn(),
    setSource: vi.fn(),
    commitHistory: vi.fn(),
    syncRuntimeState: vi.fn(),
    withHistoryMuted: (run) => run(),
    ensureBrowserFrameOnTop: vi.fn(),
  };
  const snapshot: EditorImageSnapshot = {
    id: crypto.randomUUID(),
    canvas,
    originalDocument: null,
    sourceId: 'source',
    sourceDataUrl: image.dataUrl,
    sourceTransform: null,
    intention: 'new-image',
    order: [],
    sources: [],
    names: [],
    replacementAllowed: false,
    raster: null,
    captureRaster: null,
    captureBounds: { left: 0, top: 0, width: 2, height: 3 },
    contextMode: 'surroundings',
    regionSource: 'canvas',
    inputBounds: { left: 0, top: 0, width: 2, height: 3 },
    targetBounds: { left: 0, top: 0, width: 2, height: 3 },
  };
  type Deps = Required<NonNullable<Parameters<typeof createImageEditorSession>[1]>>;
  const deps = {
    capture: vi.fn<Deps['capture']>(async () => snapshot),
    prepare: vi.fn<Deps['prepare']>(async (source, _size, variant) => ({
      ...source,
      raster: variant?.image ?? source.captureRaster,
    })),
    apply: vi.fn<Deps['apply']>(async () => ({ object: new Rect(), signature: 'receipt' })),
    openDocument: vi.fn<Deps['openDocument']>(async () => {}),
    run: vi.fn<Deps['run']>(async ({ request, receive }) => {
      for (let variant = 0; variant < request.context.parameters.variants; variant++)
        receive({ type: 'image', requestId: request.requestId, variant, image });
    }),
  };
  const session = createImageEditorSession(() => controller, deps);
  session.setDraft({ prompt: 'Draw a square' });
  return { session, controller, snapshot, deps };
}
beforeEach(() => vi.clearAllMocks());

describe('temporary assistant session', () => {
  it('refines variant two of three using only its distinct image bytes and retains the other variants', async () => {
    const { session, deps } = setup();
    const images = [variantImage(40), variantImage(120), variantImage(220)];
    deps.run.mockImplementationOnce(async ({ request, receive }) => {
      images.forEach((image, variant) =>
        receive({ type: 'image', requestId: request.requestId, variant, image })
      );
    });
    session.setDraft({ parameters: { variants: 3 } });
    await session.generate(model);
    const original = session.getSnapshot().steps[0]!;
    session.chooseVariant(original.id, 1);
    session.setDraft({ prompt: 'Refine the second variant', parameters: { variants: 1 } });
    await session.generate(model);
    expect(deps.run.mock.calls[1]?.[0].request.context.images).toEqual([
      { ...images[1], role: 'source' },
    ]);
    expect(session.getSnapshot().steps[0]?.variants.map((variant) => variant?.image)).toEqual(
      images
    );
  });
  it('does not add a duplicate or history entry when the same unchanged variant is applied again', async () => {
    const { session, deps } = setup();
    await session.generate(model);
    await session.apply('add', false, 'AI image');
    expect(session.isApplied('add')).toBe(true);
    expect(session.isApplied('update')).toBe(true);
    await session.apply('add', false, 'AI image');
    await session.apply('update', false, 'AI image');
    expect(deps.apply).toHaveBeenCalledOnce();
    session.setDraft({ prompt: 'Refine' });
    await session.generate(model);
    expect(session.isApplied('add')).toBe(false);
    await session.apply('add', false, 'AI image');
    expect(deps.apply).toHaveBeenCalledTimes(2);
  });
  it('opens the chosen result without an API or current-document write and preserves it after failure', async () => {
    const { session, deps, controller } = setup();
    await session.generate(model);
    deps.openDocument.mockRejectedValueOnce(new Error('private browser failure'));
    await session.openDocument('Generated image');
    expect(session.getSnapshot().error).toBe('open-document-failed');
    expect(session.getSelectedVariant()?.image).toEqual(image);
    expect(session.getSnapshot().steps).toHaveLength(1);
    await session.openDocument('Generated image');
    expect(session.getSnapshot().error).toBeNull();
    expect(deps.openDocument).toHaveBeenCalledTimes(2);
    expect(deps.openDocument).toHaveBeenLastCalledWith(image, 'Generated image');
    expect(deps.run).toHaveBeenCalledOnce();
    expect(deps.apply).not.toHaveBeenCalled();
    expect(controller.commitHistory).not.toHaveBeenCalled();
  });
  it('freezes the source once and refines only the selected result without a document write', async () => {
    const { session, deps, controller } = setup();
    session.setDraft({ parameters: { variants: 2 } });
    await session.generate(model);
    const step = session.getSnapshot().steps[0]!;
    session.chooseVariant(step.id, 0);
    session.setDraft({ prompt: 'Make it green' });
    await session.generate(model);
    expect(deps.capture).toHaveBeenCalledOnce();
    expect(deps.run).toHaveBeenCalledTimes(2);
    expect(deps.run.mock.calls[1]?.[0].request.context).toMatchObject({
      prompt: 'Make it green',
      images: [{ ...image, role: 'source' }],
    });
    expect(session.getSnapshot().steps).toHaveLength(2);
    expect(session.getSnapshot().draft.prompt).toBe('');
    expect(controller.commitHistory).not.toHaveBeenCalled();
    expect(deps.apply).not.toHaveBeenCalled();
  });
  it('preserves finished variants and the draft after a partial failure without retry', async () => {
    const { session, deps } = setup();
    deps.run.mockImplementation(async ({ request, receive }) => {
      receive({ type: 'image', requestId: request.requestId, variant: 0, image });
      throw new Error('provider-failed');
    });
    await session.generate(model);
    expect(session.getSelectedVariant()?.image).toEqual(image);
    expect(session.getSnapshot().error).toBe('provider-failed');
    expect(session.getSnapshot().draft.prompt).toBe('Draw a square');
    expect(deps.run).toHaveBeenCalledOnce();
  });
  it('rejects late images after cancellation and does not admit a second job while one is active', async () => {
    const { session, deps } = setup();
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    deps.run.mockImplementation(async ({ request, receive }) => {
      await wait;
      receive({ type: 'image', requestId: request.requestId, variant: 0, image });
    });
    const flight = session.generate(model);
    await vi.waitFor(() => expect(deps.run).toHaveBeenCalledOnce());
    await session.generate(model);
    session.stop();
    release();
    await flight;
    expect(deps.run).toHaveBeenCalledOnce();
    expect(session.getSelectedVariant()).toBeNull();
    expect(session.getSnapshot()).toMatchObject({ status: 'idle', error: 'cancelled' });
  });
  it('keeps history for a new task and clears only disposable session data after Apply', async () => {
    const { session, deps, controller } = setup();
    await session.generate(model);
    await session.apply('add', false, 'AI result');
    expect(deps.apply).toHaveBeenCalledOnce();
    expect(session.getSnapshot().steps[0]?.applied).toBe(true);
    session.newTask();
    expect(session.getSnapshot().steps).toHaveLength(1);
    expect(session.getSnapshot().source).toBeNull();
    session.setDraft({ parameters: { variants: 1, resolution: '768', aspectRatio: '16:9' } });
    session.clear();
    expect(session.getSnapshot().draft.parameters).toMatchObject({
      resolution: '768',
      aspectRatio: '16:9',
    });
    expect(session.getSnapshot().steps).toEqual([]);
    expect(deps.apply).toHaveBeenCalledOnce();
    expect(controller.setSource).not.toHaveBeenCalled();
  });
  it('limits an operation without discarding its history or sending a hidden extra request', async () => {
    const { session, deps } = setup();
    for (let i = 0; i < 11; i++) {
      session.setDraft({ prompt: `Step ${i}` });
      await session.generate(model);
    }
    expect(deps.run).toHaveBeenCalledTimes(10);
    expect(session.getSnapshot().steps).toHaveLength(10);
    expect(session.getSnapshot().error).toBe('session-limit');
    session.newTask();
    session.setDraft({ prompt: 'A new task' });
    await session.generate(model);
    expect(deps.run).toHaveBeenCalledTimes(11);
  });
});

it('retains explicit parameters through repeated bootstrap and inspector remounts', () => {
  const { session } = setup();
  session.configureParameters('same-model-profile', {
    variants: 1,
    aspectRatio: '1:1',
    resolution: '768',
  });
  session.setDraft({ parameters: { variants: 3, aspectRatio: '16:9', resolution: '768' } });
  session.configureParameters('same-model-profile', {
    variants: 1,
    aspectRatio: '1:1',
    resolution: '768',
  });
  expect(session.getSnapshot().draft.parameters).toMatchObject({
    variants: 3,
    aspectRatio: '16:9',
  });
  session.clear();
  session.configureParameters('same-model-profile', {
    variants: 1,
    aspectRatio: '1:1',
    resolution: '768',
  });
  expect(session.getSnapshot().draft.parameters.aspectRatio).toBe('16:9');
  session.configureParameters('different-model-profile', { variants: 1, aspectRatio: '4:3' });
  expect(session.getSnapshot().draft.parameters).toMatchObject({
    variants: 3,
    aspectRatio: '16:9',
    resolution: '768',
  });
});

it('requires explicit model choice before sending a refinement to another destination', async () => {
  const { session, deps } = setup();
  await session.generate(model);
  const next = {
    ...model,
    modelId: 'another',
    providerId: 'another-provider',
    destinationBinding: `sha256:${'b'.repeat(64)}`,
  };
  session.setDraft({ prompt: 'A refinement' });
  expect(session.modelChoiceRequired(next)).toBe(true);
  await session.generate(next);
  expect(deps.run).toHaveBeenCalledOnce();
  expect(session.getSnapshot().error).toBe('model-choice-required');
  session.acknowledgeModel(next);
  await session.generate(next);
  expect(deps.run).toHaveBeenCalledTimes(2);
});

it('retains captured pixels while preparing another size and refuses payment after preparation fails', async () => {
  const { session, deps, snapshot } = setup();
  snapshot.intention = 'layers';
  snapshot.raster = image;
  snapshot.captureRaster = image;
  session.setDraft({ intention: 'layers', prompt: 'Change selected objects' });
  await session.refreshSource(undefined, { width: 768, height: 768 });
  expect(session.sourceIsPrepared({ width: 768, height: 768 })).toBe(true);
  deps.prepare.mockRejectedValueOnce(new Error('output-too-small'));
  await session.prepareSource({ width: 1, height: 1 });
  await session.generate(model, undefined, { width: 1, height: 1 });
  expect(deps.capture).toHaveBeenCalledOnce();
  expect(deps.run).not.toHaveBeenCalled();
  expect(session.sourceIsPrepared({ width: 1, height: 1 })).toBe(false);
  expect(session.getSnapshot().source?.captureRaster).toBe(image);
});

it('fills absent parameters from the selected profile without resetting explicit choices', () => {
  const { session } = setup();
  session.configureParameters('generic', { variants: 1 });
  session.setDraft({ parameters: { variants: 3 } });
  session.configureParameters('klein', {
    variants: 1,
    resolution: '768',
    aspectRatio: '1:1',
    outputFormat: 'png',
  });
  expect(session.getSnapshot().draft.parameters).toEqual({
    variants: 3,
    resolution: '768',
    aspectRatio: '1:1',
    outputFormat: 'png',
  });
});

it('preserves an explicit provider-default choice across profile changes and remounts', () => {
  const { session } = setup();
  session.configureParameters('first', { variants: 1, resolution: '768', aspectRatio: '1:1' });
  session.setDraft({ parameters: { variants: 2, resolution: undefined, aspectRatio: '16:9' } });
  session.configureParameters('second', { variants: 1, resolution: '1K', aspectRatio: '1:1' });
  session.configureParameters('second', { variants: 1, resolution: '1K', aspectRatio: '1:1' });
  expect(session.getSnapshot().draft.parameters).toEqual({
    variants: 2,
    resolution: undefined,
    aspectRatio: '16:9',
  });
});

it('maps editing instructions to the actual raster after a different-size result', async () => {
  const { session, snapshot, deps } = setup();
  snapshot.intention = 'region';
  snapshot.captureBounds = { left: 10, top: 20, width: 20, height: 30 };
  snapshot.inputBounds = snapshot.captureBounds;
  snapshot.targetBounds = snapshot.captureBounds;
  snapshot.captureRaster = image;
  session.setDraft({ intention: 'region' });
  await session.refreshSource(snapshot.targetBounds);
  await session.generate(model);
  expect(deps.run.mock.calls[0]?.[0].request.context.editRegion).toEqual({
    left: 0,
    top: 0,
    width: 2,
    height: 3,
  });
  session.setDraft({ prompt: 'Refine the complete result' });
  await session.prepareSource(null);
  await session.generate(model);
  expect(deps.run.mock.calls[1]?.[0].request.context.editRegion).toEqual({
    left: 0,
    top: 0,
    width: 2,
    height: 3,
  });
});

it('pads a tiny reference before approval without changing its draft bytes', async () => {
  const { session, deps } = setup();
  const padded = variantImage(40, 256, 256);
  vi.mocked(reframeEditorRaster).mockResolvedValueOnce(padded);
  session.setDraft({ references: [image] });
  await session.generate(model, undefined, null, 256);
  expect(reframeEditorRaster).toHaveBeenCalledWith(
    image,
    { left: 0, top: 0, width: 2, height: 3 },
    { left: 0, top: 0, width: 2, height: 3 },
    { left: -127, top: -126, width: 256, height: 256 },
    expect.any(AbortSignal)
  );
  expect(deps.run.mock.calls[0]?.[0].request.context.images).toEqual([
    { ...padded, role: 'reference' },
  ]);
  expect(session.getSnapshot().draft.references).toEqual([image]);
});

it('does not dispatch after cancellation during reference padding', async () => {
  const { session, deps } = setup();
  let release!: (value: typeof image) => void;
  vi.mocked(reframeEditorRaster).mockReturnValueOnce(
    new Promise((done) => {
      release = done;
    })
  );
  session.setDraft({ references: [image] });
  const flight = session.generate(model, undefined, null, 256);
  await Promise.resolve();
  session.stop();
  release(variantImage(40, 256, 256));
  await flight;
  expect(deps.run).not.toHaveBeenCalled();
  expect(session.getSnapshot().draft.references).toEqual([image]);
  expect(session.getSnapshot().error).toBe('cancelled');
});
