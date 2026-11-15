// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useReviewEditingTools } from './use-review-editing';
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
    exporter: { phase: 'idle' },
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
    change(patch: Partial<typeof args>) {
      args = { ...args, ...patch };
      render();
    },
  };
}
it('admits the original frame once, commits through history and selects inserted project time', async () => {
  const probe = mount();
  await act(async () => probe.get().cuts.addFreeze());
  expect(probe.pause).toHaveBeenCalledTimes(2);
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
it.each(['revision', 'source', 'refusal'] as const)(
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
    if (change === 'revision') probe.workspace.revision++;
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
