// @vitest-environment jsdom
import { FabricImage, getEnv } from 'fabric';
import { describe, expect, it, vi } from 'vitest';
import type { RasterTarget, RasterTargetAdapter } from './adapters';
import type { RasterSourceGeometry } from './contracts';
import {
  type RasterComputeClient,
  type RasterComputeCommand,
  type RasterComputeValue,
  RasterComputeError,
} from './compute';
import { createEditorRasterMetadata } from './image-state';
import type { RasterPixelData } from './pixels';
import { createRasterSession, type RasterPresentation } from './session';
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(geometry: Partial<RasterSourceGeometry> = {}) {
  const bitmap = getEnv().document.createElement('canvas');
  bitmap.width = 4;
  bitmap.height = 1;
  const object = new FabricImage(bitmap);
  const metadata = createEditorRasterMetadata(bitmap.toDataURL(), 4, 1);
  let target: RasterTarget = {
    identity: object,
    id: 'same',
    metadata,
    geometry: {
      width: 4,
      height: 1,
      crop: { x: 0, y: 0, width: 4, height: 1 },
      sourceToScene: [1, 0, 0, 1, 0, 0],
      periodic: false,
      ...geometry,
    },
    permission: 'allowed',
    kind: 'image',
    label: 'image',
    revision: 'one',
  };
  const source: RasterPixelData = {
    width: 4,
    height: 1,
    color: new Uint8ClampedArray(16).fill(255),
    visibility: null,
    key: null,
  };
  const adapter: RasterTargetAdapter = {
    prepareBackgroundCorrection: async () => {
      throw new Error('unused correction');
    },
    prepareNativeCorrectionPreview: async () => null,
    prepareCorrectionPreview: async () => null,
    publishCorrection: async () => false,
    resolve: () => target,
    resolveById: () => target,
    isCurrent: (expected) => expected === target,
    hydrateTarget: async () => {},
    publish: vi.fn(async () => true),
    copy: vi.fn(async () => true),
    allowContentEditing: vi.fn(() => true),
    flip: vi.fn(async () => true),
    preparePreview: vi.fn(async () => null),
  };
  const compute: RasterComputeClient = {
    run: vi.fn(async (command: RasterComputeCommand): Promise<RasterComputeValue> => {
      if (command.kind === 'decode') return { kind: 'decoded', pixels: source };
      if (command.kind === 'fragment') return { kind: 'fragment', dataUrl: bitmap.toDataURL() };
      return { kind: 'encoded', candidate: { metadata, visibleFullDataUrl: bitmap.toDataURL() } };
    }),
    cancel: vi.fn(),
    dispose: vi.fn(),
  };
  const presentation: RasterPresentation = {
    pixels: vi.fn(),
    selection: vi.fn(),
    draftSelection: vi.fn(),
    crop: vi.fn(),
    clear: vi.fn(),
    prepared: vi.fn(),
  };
  const session = createRasterSession({ adapter, compute, presentation });
  return {
    session,
    adapter,
    compute,
    presentation,
    source,
    replace() {
      target = { ...target, identity: new FabricImage(bitmap), revision: 'two' };
      return target;
    },
  };
}
describe('raster mounted session authority', () => {
  it('publishes a stable small snapshot and preserves settings across same-id replacement', () => {
    const { session, replace } = setup();
    expect(session.getSnapshot()).toBe(session.getSnapshot());
    session.updateSettings({ tolerance: 9, color: 'rgba(1, 2, 3, 0.5)' });
    replace();
    session.refresh();
    expect(session.getSnapshot().settings.tolerance).toBe(9);
    expect(session.getSnapshot().settings.color).toBe('rgba(1, 2, 3, 0.5)');
    expect(Object.values(session.getSnapshot()).some((v) => v instanceof Uint8Array)).toBe(false);
    session.dispose();
  });
  it('distinguishes no selection from explicit empty and Delete does not publish empty pixels', async () => {
    const { session, adapter } = setup();
    session.setTool('select');
    expect(session.getSnapshot().selection).toBe('none');
    session.invertSelection();
    expect(session.getSnapshot().selection).toBe('empty');
    expect(session.handlesDelete()).toBe(true);
    await session.hideSelected();
    expect(adapter.publish).not.toHaveBeenCalled();
    session.clearSelection();
    expect(session.getSnapshot().selection).toBe('none');
    session.dispose();
  });
  it('discards a late decode after same-id replacement without publication or mode reopening', async () => {
    const { session, compute, adapter, replace, source } = setup(),
      held = deferred<RasterComputeValue>();
    vi.mocked(compute.run).mockReturnValueOnce(held.promise);
    session.setTool('fill');
    const job = session.fillSelected();
    replace();
    session.refresh();
    session.setTool(null);
    held.resolve({ kind: 'decoded', pixels: source });
    await job;
    expect(adapter.publish).not.toHaveBeenCalled();
    expect(session.getSnapshot().tool).toBe(null);
    session.dispose();
  });
  it('cancels a gesture with its prior accepted selection and releases exactly one stroke commit', async () => {
    const { session, adapter } = setup();
    session.setTool('select');
    session.beginGesture({ x: 0, y: 0 });
    await session.endGesture({ x: 2, y: 1 });
    expect(session.getSnapshot().selection).toBe('active');
    session.setTool('erase');
    session.beginGesture({ x: 0.5, y: 0.5 });
    session.moveGesture({ x: 3.5, y: 0.5 });
    session.cancel();
    await Promise.resolve();
    expect(adapter.publish).not.toHaveBeenCalled();
    expect(session.getSnapshot().selection).toBe('active');
    session.beginGesture({ x: 0.5, y: 0.5 });
    await session.endGesture({ x: 3.5, y: 0.5 });
    expect(adapter.publish).toHaveBeenCalledOnce();
    session.dispose();
  });
  it('preserves accepted input on worker refusal and supports one successful retry', async () => {
    const { session, compute, adapter, source } = setup();
    vi.mocked(compute.run).mockRejectedValueOnce(new RasterComputeError('resource-limit'));
    await session.fillSelected();
    expect(adapter.publish).not.toHaveBeenCalled();
    expect(session.getSnapshot().error).toBe('resource-limit');
    await session.fillSelected();
    expect(adapter.publish).toHaveBeenCalledOnce();
    expect(source.visibility).toBe(null);
    session.dispose();
  });
  it('invalidates a held correction preparation on cancellation', async () => {
    const { session, presentation } = setup(),
      held = deferred<void>();
    const job = session.runCorrectionPreparation('same', async (_signal, current) => {
      await held.promise;
      if (current())
        session.showPreparedPreview('same', {
          object: new FabricImage(getEnv().document.createElement('canvas')),
          dispose: vi.fn(),
        });
    });
    session.cancel();
    held.resolve();
    await job;
    expect(presentation.prepared).not.toHaveBeenCalled();
    session.dispose();
  });
});

it('keeps crop local to metadata and accepts it once after preview without mutating the source', async () => {
  const { session, adapter, source } = setup();
  session.setTool('crop');
  await Promise.resolve();
  await Promise.resolve();
  expect(session.beginGesture({ x: 1, y: 0 })).toBe(true);
  await session.endGesture({ x: 3, y: 1 });
  expect(session.getSnapshot().cropPending).toBe(true);
  expect(adapter.publish).not.toHaveBeenCalled();
  await session.applyCrop();
  expect(adapter.publish).toHaveBeenCalledOnce();
  expect(session.getSnapshot()).toMatchObject({ editing: true, tool: null, cropPending: false });
  expect(vi.mocked(adapter.publish).mock.calls[0]![1].metadata.sniptaleRasterState.crop).toEqual({
    x: 1,
    y: 0,
    width: 2,
    height: 1,
  });
  expect(source.color).toEqual(new Uint8ClampedArray(16).fill(255));
  session.dispose();
});
it('includes the frozen release segment when a fast brush finishes before decode', async () => {
  const { session, compute, adapter, source } = setup(),
    held = deferred<RasterComputeValue>();
  vi.mocked(compute.run).mockReturnValueOnce(held.promise);
  session.setTool('erase');
  session.updateSettings({ brushSize: 1 });
  session.beginGesture({ x: 0.5, y: 0.5 });
  const done = session.endGesture({ x: 3.5, y: 0.5 });
  session.moveGesture({ x: 100, y: 0.5 });
  held.resolve({ kind: 'decoded', pixels: source });
  await done;
  const command = vi.mocked(compute.run).mock.calls.find(([value]) => value.kind === 'encode')?.[0];
  expect(command?.kind).toBe('encode');
  if (command?.kind === 'encode')
    expect(command.after.visibility).toEqual(new Uint8Array([0, 0, 0, 0]));
  expect(adapter.publish).toHaveBeenCalledOnce();
  session.dispose();
});
it('uses current pencil RGBA alpha for selected fill', async () => {
  const { session, compute } = setup();
  session.updateSettings({ color: 'rgba(10, 20, 30, 0.5)' });
  await session.fillSelected();
  const command = vi.mocked(compute.run).mock.calls.find(([value]) => value.kind === 'edit')?.[0];
  expect(command?.kind === 'edit' && command.color).toEqual([10, 20, 30, 128]);
  session.dispose();
});

it('clips a periodic contour before folding and edits its shared source crop once', async () => {
  const { session, compute, presentation, adapter } = setup({
    periodic: true,
    sourceClip: { x: 3, y: 0, width: 2, height: 1 },
  });
  session.setTool('select');
  expect(session.beginGesture({ x: 3, y: 0 })).toBe(true);
  await session.endGesture({ x: 6, y: 1 });
  expect(vi.mocked(presentation.selection).mock.calls.at(-1)?.[1]).toEqual(
    new Uint8Array([255, 0, 0, 255])
  );
  session.selectAll();
  await session.fillSelected();
  const command = vi.mocked(compute.run).mock.calls.find(([value]) => value.kind === 'edit')?.[0];
  expect(command?.kind === 'edit' && command.region).toEqual(new Uint8Array([255, 255, 255, 255]));
  expect(adapter.publish).toHaveBeenCalledOnce();
  session.dispose();
});
it('keeps nonperiodic full-region commands inside the visible source bounds', async () => {
  const { session, compute } = setup({ sourceClip: { x: 1, y: 0, width: 2, height: 1 } });
  await session.fillSelected();
  const command = vi.mocked(compute.run).mock.calls.find(([value]) => value.kind === 'edit')?.[0];
  expect(command?.kind === 'edit' && command.region).toEqual(new Uint8Array([0, 255, 255, 0]));
  session.dispose();
});

it('routes wand modes, click fill and remove-color through source-restricted compute commands', async () => {
  const { session, compute, adapter } = setup(),
    normal = vi.mocked(compute.run).getMockImplementation()!;
  vi.mocked(compute.run).mockImplementation(async (command, signal) => {
    if (command.kind === 'region') {
      const mask = new Uint8Array(4);
      mask[command.seed.x] = 255;
      return { kind: 'region', mask };
    }
    return normal(command, signal);
  });
  async function click(x: number) {
    const idle = new Promise<void>((resolve) => {
      const remove = session.subscribe(() => {
        if (!session.getSnapshot().busy) {
          remove();
          resolve();
        }
      });
    });
    expect(session.beginGesture({ x, y: 0.5 })).toBe(true);
    await idle;
  }
  try {
    session.setTool('select');
    session.setSelectionMethod('wand');
    await click(0.5);
    session.setSelectionMode('add');
    await click(2.5);
    expect(session.getSnapshot()).toMatchObject({
      selection: 'active',
      selectionMethod: 'wand',
      selectionMode: 'add',
    });
    session.setTool('fill');
    await click(2.5);
    session.setTool('remove-color');
    await click(0.5);
    expect(adapter.publish).toHaveBeenCalledTimes(2);
    const edits = vi
      .mocked(compute.run)
      .mock.calls.map(([command]) => command)
      .filter((command) => command.kind === 'edit');
    expect(edits.map((command) => command.action)).toEqual(['fill', 'remove']);
    expect(edits[1]?.selection).toEqual(new Uint8Array([255, 0, 255, 0]));
  } finally {
    session.dispose();
  }
});
it('copies only selected bounds, skips explicit empty copy, and keeps failures local', async () => {
  const { session, adapter } = setup();
  try {
    session.setTool('select');
    session.beginGesture({ x: 1, y: 0 });
    await session.endGesture({ x: 3, y: 1 });
    await session.copySelected();
    expect(adapter.copy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^data:image\/png;/),
      { x: 1, y: 0, width: 2, height: 1 },
      expect.any(AbortSignal),
      new Uint8Array([0, 255, 255, 0])
    );
    session.clearSelection();
    session.invertSelection();
    await session.copySelected();
    expect(adapter.copy).toHaveBeenCalledOnce();
    session.selectAll();
    vi.mocked(adapter.copy).mockRejectedValueOnce(new Error('copy'));
    await session.copySelected();
    expect(session.getSnapshot()).toMatchObject({
      error: 'compute-failed',
      busy: false,
      selection: 'active',
    });
  } finally {
    session.dispose();
  }
});
it('reuses exact target commands for permission, flips and disposable corrections', async () => {
  const { session, adapter, presentation } = setup();
  try {
    session.allowContentEditing();
    expect(adapter.allowContentEditing).toHaveBeenCalledOnce();
    await session.flipHorizontal();
    await session.flipVertical();
    expect(adapter.flip).toHaveBeenNthCalledWith(1, expect.anything(), 'horizontal');
    expect(adapter.flip).toHaveBeenNthCalledWith(2, expect.anything(), 'vertical');
    vi.mocked(adapter.flip).mockRejectedValueOnce(new Error('flip'));
    await session.flipVertical();
    expect(session.getSnapshot().error).toBe('compute-failed');
    session.setCropRatio('4:3');
    expect(session.getSnapshot().cropRatio).toBe('4:3');
    const preview = {
      object: new FabricImage(getEnv().document.createElement('canvas')),
      dispose: vi.fn(),
    };
    expect(session.showPreparedPreview('same', preview)).toBe(true);
    expect(presentation.prepared).toHaveBeenCalledWith(expect.anything(), preview);
    session.clearPreparedPreview();
    expect(presentation.clear).toHaveBeenCalled();
    await session.runCorrectionPreparation('same', async (_signal, current) => {
      expect(current()).toBe(true);
    });
    await session.runCorrectionPreparation('same', async () => {
      throw new RasterComputeError('resource-limit');
    });
    expect(session.getSnapshot().error).toBe('resource-limit');
  } finally {
    session.dispose();
  }
});

it('binds explicit editing to one target and distinguishes Cursor from leaving the mode', () => {
  const { session, replace } = setup();
  expect(session.getSnapshot().editing).toBe(false);
  session.enterEditing();
  expect(session.getSnapshot()).toMatchObject({ editing: true, tool: null });
  session.selectTool('select');
  session.selectAll();
  session.selectTool('erase');
  expect(session.getSnapshot()).toMatchObject({
    editing: true,
    tool: 'erase',
    selection: 'active',
  });
  session.selectTool(null);
  expect(session.getSnapshot()).toMatchObject({ editing: true, tool: null, selection: 'active' });
  session.exitEditing();
  expect(session.getSnapshot()).toMatchObject({ editing: false, tool: null, selection: 'none' });
  session.enterEditing();
  session.selectTool('fill');
  replace();
  session.refresh();
  expect(session.getSnapshot()).toMatchObject({ editing: false, tool: null });
  session.selectTool('erase');
  expect(session.getSnapshot()).toMatchObject({ editing: false, tool: null });
  session.dispose();
});

it('keeps the accepted mask visible during an open lasso and accepts it only on release', async () => {
  const { session, presentation } = setup();
  session.setTool('select');
  session.selectAll();
  const accepted = vi.mocked(presentation.selection).mock.calls.at(-1)?.[1];
  session.setSelectionMethod('lasso');
  vi.mocked(presentation.selection).mockClear();
  session.beginGesture({ x: 0, y: 0 });
  expect(presentation.selection).toHaveBeenLastCalledWith(session.getTarget(), accepted);
  session.moveGesture({ x: 3, y: 0 });
  session.moveGesture({ x: 3, y: 1 });
  expect(presentation.draftSelection).toHaveBeenCalledWith(
    session.getTarget(),
    expect.any(Array),
    'lasso'
  );
  expect(presentation.selection).toHaveBeenCalledTimes(1);
  expect(session.getSnapshot().selection).toBe('active');
  await session.endGesture({ x: 0, y: 1 });
  expect(presentation.selection).toHaveBeenCalledTimes(2);
  expect(vi.mocked(presentation.selection).mock.calls.at(-1)?.[1]).toEqual(
    new Uint8Array([255, 255, 255, 0])
  );
  session.dispose();
});
it('uses per-gesture add and subtract without changing the default selection operation', async () => {
  const { session, presentation } = setup();
  session.setTool('select');
  async function select(from: number, to: number, mode: 'new' | 'add' | 'subtract') {
    session.beginGesture({ x: from, y: 0 }, mode);
    await session.endGesture({ x: to, y: 1 });
    return vi.mocked(presentation.selection).mock.calls.at(-1)?.[1];
  }
  expect(await select(0, 1, 'new')).toEqual(new Uint8Array([255, 0, 0, 0]));
  expect(await select(2, 3, 'add')).toEqual(new Uint8Array([255, 0, 255, 0]));
  expect(await select(0, 1, 'subtract')).toEqual(new Uint8Array([0, 0, 255, 0]));
  expect(await select(3, 4, 'new')).toEqual(new Uint8Array([0, 0, 0, 255]));
  expect(session.getSnapshot().selectionMode).toBe('new');
  session.dispose();
});

it.each(['fill', 'select'] as const)(
  'keeps the admitted %s operation configuration while later controls change during decode and region compute',
  async (tool) => {
    const { session, compute, source, adapter, presentation } = setup(),
      decode = deferred<RasterComputeValue>(),
      region = deferred<RasterComputeValue>(),
      regionEntered = deferred<RasterComputeCommand>(),
      settled = deferred<void>(),
      normal = vi.mocked(compute.run).getMockImplementation()!;
    vi.mocked(compute.run).mockImplementation(async (command, signal) => {
      if (command.kind === 'decode') return decode.promise;
      if (command.kind === 'region') {
        regionEntered.resolve(command);
        return region.promise;
      }
      return normal(command, signal);
    });
    session.setTool(tool);
    session.setSelectionMethod('wand');
    session.updateSettings({ tolerance: 10, contiguous: true, grow: 1, color: '#112233' });
    const remove = session.subscribe(() => {
      if (!session.getSnapshot().busy) settled.resolve();
    });
    try {
      expect(session.beginGesture({ x: 2.5, y: 0.5 }, 'new')).toBe(true);
      const signal = vi.mocked(compute.run).mock.calls[0]![1];
      session.updateSettings({ tolerance: 20, contiguous: false, grow: 2, color: '#445566' });
      session.setSelectionMethod('lasso');
      session.setSelectionMode('subtract');
      expect(session.getSnapshot()).toMatchObject({
        busy: true,
        selectionMethod: 'lasso',
        selectionMode: 'subtract',
        settings: { tolerance: 20, contiguous: false, grow: 2, color: '#445566' },
      });
      expect(signal?.aborted).toBe(false);
      decode.resolve({ kind: 'decoded', pixels: source });
      expect(await regionEntered.promise).toMatchObject({
        kind: 'region',
        tolerance: 26,
        contiguous: true,
        grow: 1,
      });
      session.updateSettings({ tolerance: 30, color: '#778899' });
      expect(session.getSnapshot().busy).toBe(true);
      region.resolve({ kind: 'region', mask: new Uint8Array([0, 0, 255, 0]) });
      await settled.promise;
      if (tool === 'fill') {
        const edit = vi
          .mocked(compute.run)
          .mock.calls.find(([command]) => command.kind === 'edit')?.[0];
        expect(edit?.kind === 'edit' && edit.color).toEqual([17, 34, 51, 255]);
        expect(adapter.publish).toHaveBeenCalledOnce();
      } else {
        expect(presentation.selection).toHaveBeenLastCalledWith(
          session.getTarget(),
          new Uint8Array([0, 0, 255, 0])
        );
        expect(adapter.publish).not.toHaveBeenCalled();
      }
      expect(session.getSnapshot().settings.color).toBe('#778899');
    } finally {
      remove();
      session.dispose();
    }
  }
);

it('captures selected fill color before decode while accepting future color changes', async () => {
  const { session, compute, source, adapter } = setup(),
    held = deferred<RasterComputeValue>();
  session.updateSettings({ color: 'rgba(10, 20, 30, 0.5)' });
  vi.mocked(compute.run).mockReturnValueOnce(held.promise);
  try {
    const job = session.fillSelected();
    session.updateSettings({ color: '#abcdef' });
    expect(session.getSnapshot()).toMatchObject({ busy: true, settings: { color: '#abcdef' } });
    held.resolve({ kind: 'decoded', pixels: source });
    await job;
    const edit = vi
      .mocked(compute.run)
      .mock.calls.find(([command]) => command.kind === 'edit')?.[0];
    expect(edit?.kind === 'edit' && edit.color).toEqual([10, 20, 30, 128]);
    expect(adapter.publish).toHaveBeenCalledOnce();
  } finally {
    session.dispose();
  }
});

it('finishes the admitted brush with its original diameter and hardness after pending decode', async () => {
  const { session, compute, source, adapter } = setup(),
    held = deferred<RasterComputeValue>();
  session.setTool('erase');
  session.updateSettings({ brushSize: 1, hardness: 100 });
  vi.mocked(compute.run).mockReturnValueOnce(held.promise);
  try {
    expect(session.beginGesture({ x: 0.5, y: 0.5 })).toBe(true);
    const signal = vi.mocked(compute.run).mock.calls[0]![1];
    session.updateSettings({ brushSize: 4, hardness: 0 });
    expect(session.getSnapshot()).toMatchObject({
      busy: true,
      settings: { brushSize: 4, hardness: 0 },
    });
    expect(signal?.aborted).toBe(false);
    const done = session.endGesture({ x: 0.5, y: 0.5 });
    held.resolve({ kind: 'decoded', pixels: source });
    await done;
    const encode = vi
      .mocked(compute.run)
      .mock.calls.find(([command]) => command.kind === 'encode')?.[0];
    expect(encode?.kind === 'encode' && encode.after.visibility).toEqual(
      new Uint8Array([0, 255, 255, 255])
    );
    expect(source.visibility).toBeNull();
    expect(adapter.publish).toHaveBeenCalledOnce();
  } finally {
    session.dispose();
  }
});

it('updates the existing crop preview immediately when its ratio changes', async () => {
  const { session, presentation } = setup();
  session.setTool('crop');
  await Promise.resolve();
  await Promise.resolve();
  session.beginGesture({ x: 1, y: 0 });
  await session.endGesture({ x: 3, y: 1 });
  session.setCropRatio('1:1');
  expect(presentation.crop).toHaveBeenLastCalledWith(expect.anything(), {
    x: 2,
    y: 0,
    width: 1,
    height: 1,
  });
  session.dispose();
});

it('resizes and moves a crop draft without publishing until acceptance, and can reset it', async () => {
  const { session, adapter } = setup();
  session.setTool('crop');
  await Promise.resolve();
  await Promise.resolve();
  session.beginGesture({ x: 1, y: 0 });
  await session.endGesture({ x: 3, y: 1 });
  session.beginGesture({ x: 3, y: 0.5 }, undefined, 'e');
  await session.endGesture({ x: 4, y: 0.5 });
  expect(session.getCropBounds()).toEqual({ x: 1, y: 0, width: 3, height: 1 });
  session.beginGesture({ x: 2, y: 0.5 }, undefined, 'move');
  await session.endGesture({ x: 1, y: 0.5 });
  expect(session.getCropBounds()).toEqual({ x: 0, y: 0, width: 3, height: 1 });
  expect(adapter.publish).not.toHaveBeenCalled();
  session.beginGesture({ x: 3.5, y: 0 });
  await session.endGesture({ x: 3.5, y: 0 });
  expect(session.getCropBounds()).toEqual({ x: 0, y: 0, width: 3, height: 1 });
  session.cancelCrop();
  await Promise.resolve();
  await Promise.resolve();
  expect(session.getSnapshot()).toMatchObject({ editing: true, tool: 'crop', cropPending: false });
  expect(session.getCropBounds()).toEqual({ x: 0, y: 0, width: 4, height: 1 });
  session.dispose();
});

it('keeps crop active when publication is refused instead of reporting successful completion', async () => {
  const { session, adapter } = setup();
  session.setTool('crop');
  await Promise.resolve();
  await Promise.resolve();
  session.beginGesture({ x: 1, y: 0 });
  await session.endGesture({ x: 3, y: 1 });
  vi.mocked(adapter.publish).mockResolvedValueOnce(false);
  await session.applyCrop();
  expect(session.getSnapshot()).toMatchObject({
    editing: true,
    tool: 'crop',
    error: 'compute-failed',
  });
  session.dispose();
});
it('does not replace a newer tool when a previous crop publication completes late', async () => {
  const { session, adapter } = setup();
  const held = deferred<boolean>();
  session.setTool('crop');
  await Promise.resolve();
  await Promise.resolve();
  session.beginGesture({ x: 1, y: 0 });
  await session.endGesture({ x: 3, y: 1 });
  vi.mocked(adapter.publish).mockReturnValueOnce(held.promise);
  const pending = session.applyCrop();
  await vi.waitFor(() => expect(adapter.publish).toHaveBeenCalledOnce());
  session.selectTool('erase');
  held.resolve(true);
  await pending;
  expect(session.getSnapshot()).toMatchObject({ editing: true, tool: 'erase' });
  session.dispose();
});

it('paints one accepted brush gesture with its captured color and opacity', async () => {
  const { session, compute, adapter, source } = setup();
  session.setTool('brush');
  session.updateSettings({ brushSize: 1, hardness: 100, opacity: 50, color: '#ff0000' });
  session.beginGesture({ x: 1.5, y: 0.5 });
  session.updateSettings({ opacity: 100, color: '#00ff00' });
  await session.endGesture({ x: 2.5, y: 0.5 });
  expect(adapter.publish).toHaveBeenCalledOnce();
  const encoded = vi
    .mocked(compute.run)
    .mock.calls.map(([command]) => command)
    .find((command) => command.kind === 'encode');
  expect(encoded?.kind).toBe('encode');
  if (encoded?.kind !== 'encode') throw new Error('Expected encoded brush');
  expect([...encoded.after.color.slice(4, 8)]).toEqual([255, 128, 128, 255]);
  expect(source.color).toEqual(new Uint8ClampedArray(16).fill(255));
  expect(session.getSnapshot()).toMatchObject({
    editing: true,
    tool: 'brush',
    settings: { color: '#00ff00', opacity: 100 },
  });
  session.dispose();
});
it('does not create a history publication for a zero-opacity brush gesture', async () => {
  const { session, adapter } = setup();
  session.setTool('brush');
  session.updateSettings({ opacity: 0 });
  session.beginGesture({ x: 1.5, y: 0.5 });
  await session.endGesture({ x: 2.5, y: 0.5 });
  expect(adapter.publish).not.toHaveBeenCalled();
  expect(session.getSnapshot()).toMatchObject({ tool: 'brush', busy: false, error: null });
  session.dispose();
});
