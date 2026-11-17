// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useReviewEditingTools } from './use-review-editing';
import { createReviewCommandFixture } from './editor-fixture.test-support';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewEdit } from '../../features/video/review/types';
const decode = vi.hoisted(() => vi.fn());
vi.mock('../../workflows/video-review/freeze-frame', () => ({ readReviewFreezeFrame: decode }));
vi.mock('./zoom-editor', () => ({ useReviewZoomEditor: () => ({}) }));
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
function mount() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  decode.mockResolvedValue({ frameTime: 3.98, frameDuration: 0.04 });
  const document = { edits: [] as ReviewEdit[] };
  const workspace = { revision: 1 };
  const commit = vi.fn(async (operation: { after: ReviewEdit }) => {
    document.edits.push(operation.after);
    workspace.revision++;
  });
  const invalid = vi.fn(),
    pause = vi.fn(),
    seekResult = vi.fn();
  let args = {
    advancedState: {
      advanced: { ui: { mode: 'advanced' } },
      setZoom: vi.fn(),
      flush: vi.fn(async () => {}),
    },
    zoom: { enabled: false, regions: [] },
    timelineDuration: 10,
    timelineSelection: { kind: 'point', time: 4 },
    activeSelection: { kind: 'none' },
    setActiveSelection: vi.fn(),
    sourceDuration: 10,
    sourceTime: 4,
    file: new Blob(['source']),
    exporter: { phase: 'idle', index: { boundaries: [0, 2, 4, 6, 8, 10] } },
    edits: document.edits,
    pause,
    seek: vi.fn(),
    seekResult,
    setTimelineSelection: vi.fn(),
    onInvalid: invalid,
    session: { getSnapshot: () => ({ snapshot: { workspace }, document }), commit },
    run: async (action: () => Promise<unknown>) => action(),
    busy: false,
    canStart: () => true,
  } as unknown as Parameters<typeof useReviewEditingTools>[0];
  let readTime = () => args.sourceTime;
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  args.commands = createReviewCommandFixture(
    () => ({
      duration: args.sourceDuration,
      time: readTime(),
      resource: args.file,
      session: args.session,
      document: {
        ...document,
        annotations: [],
        canvasComments: [],
        advancedContent: advanced,
        edits: [...args.edits],
      },
      advanced,
      selection: args.activeSelection,
      timelineSelection:
        args.timelineSelection.kind === 'point'
          ? { kind: 'point', time: readTime() }
          : args.timelineSelection,
    }),
    { pause }
  );
  const root = createRoot(globalThis.document.createElement('div'));
  let hook!: ReturnType<typeof useReviewEditingTools>;
  function Probe() {
    hook = useReviewEditingTools(args);
    return null;
  }
  const render = () => act(() => root.render(<Probe />));
  render();
  dispose = () => act(() => root.unmount());
  return {
    get: () => hook,
    workspace,
    document,
    commit,
    invalid,
    pause,
    seekResult,
    clock(read: () => number) {
      readTime = read;
    },
    change(patch: Partial<typeof args>) {
      args = { ...args, ...patch };
      if (patch.edits) document.edits = [...patch.edits];
      render();
    },
  };
}
it('admits the original frame once, commits through history and selects inserted project time', async () => {
  const probe = mount();
  await act(async () => probe.get().cuts.addFreeze());
  expect(probe.pause).toHaveBeenCalledOnce();
  expect(probe.pause.mock.invocationCallOrder[0]).toBeLessThan(decode.mock.invocationCallOrder[0]!);
  expect(probe.commit).toHaveBeenCalledOnce();
  expect(probe.document.edits).toMatchObject([
    { kind: 'freeze', start: 4, end: 4, duration: 2, frameTime: 3.98, frameDuration: 0.04 },
  ]);
  expect(probe.seekResult).toHaveBeenCalledWith(4);
  expect(probe.invalid).not.toHaveBeenCalled();
  expect(probe.get().cuts.freezing).toBe(false);
});
it('refuses a cut-hidden insertion before decoding and permits retry after source decoding fails', async () => {
  const probe = mount();
  probe.change({
    edits: [{ id: 'cut', kind: 'cut', start: 3, end: 5, requestedStart: 3, requestedEnd: 5 }],
  });
  await act(async () => probe.get().cuts.addFreeze());
  expect(decode).not.toHaveBeenCalled();
  expect(probe.invalid).toHaveBeenCalledOnce();
  probe.change({ edits: [] });
  decode.mockRejectedValueOnce(new Error('No decoded frame'));
  await act(async () => probe.get().cuts.addFreeze());
  expect(probe.commit).not.toHaveBeenCalled();
  await act(async () => probe.get().cuts.addFreeze());
  expect(probe.commit).toHaveBeenCalledOnce();
});
it.each(['temporal', 'source', 'refusal'] as const)(
  'does not publish a frame after %s changes during decode',
  async (change) => {
    const probe = mount();
    let resolve!: (value: { frameTime: number; frameDuration: number }) => void;
    decode.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = probe.get().cuts.addFreeze();
    });
    await act(async () => probe.get().cuts.addFreeze());
    expect(decode).toHaveBeenCalledOnce();
    if (change === 'temporal')
      probe.change({
        edits: [
          { id: 'new-cut', kind: 'cut', start: 0, end: 1, requestedStart: 0, requestedEnd: 1 },
        ],
      });
    else if (change === 'source') probe.change({ file: new Blob(['replacement']) });
    else probe.change({ canStart: () => false });
    await act(async () => {
      resolve({ frameTime: 3.98, frameDuration: 0.04 });
      await pending;
    });
    expect(probe.commit).not.toHaveBeenCalled();
    expect(probe.seekResult).not.toHaveBeenCalled();
  }
);
it('blocks a busy insertion without pausing or decoding the source', async () => {
  const probe = mount();
  probe.change({ busy: true });
  await act(async () => probe.get().cuts.addFreeze());
  expect(decode).not.toHaveBeenCalled();
  expect(probe.pause).not.toHaveBeenCalled();
});

it('snapshots the live source clock before asynchronous freeze preparation', async () => {
  const probe = mount();
  let clock = 6;
  probe.clock(() => clock);
  let finish!: (value: { frameTime: number; frameDuration: number }) => void;
  decode.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = probe.get().cuts.addFreeze();
  });
  expect(decode).toHaveBeenCalledWith(expect.any(Blob), 6, 10, expect.any(AbortSignal));
  clock = 8;
  await act(async () => {
    finish({ frameTime: 5.98, frameDuration: 0.04 });
    await pending;
  });
  expect(probe.document.edits[0]).toMatchObject({ start: 6, end: 6 });
});

it('reads cut insertion time at command activation without a root render', async () => {
  const probe = mount();
  let clock = 4;
  probe.clock(() => clock);
  clock = 6;
  await act(async () => probe.get().cuts.toggle('cut'));
  expect(probe.document.edits[0]).toMatchObject({ kind: 'cut', start: 6, end: 8 });
});

it('keeps a pending freeze intent through a durable acknowledgement without temporal changes', async () => {
  const probe = mount();
  let finish!: (frame: { frameTime: number; frameDuration: number }) => void;
  decode.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = probe.get().cuts.addFreeze();
  });
  probe.workspace.revision++;
  await act(async () => {
    finish({ frameTime: 3.98, frameDuration: 0.04 });
    await pending;
  });
  expect(probe.commit).toHaveBeenCalledOnce();
  expect(probe.document.edits[0]).toMatchObject({ kind: 'freeze', start: 4 });
});
