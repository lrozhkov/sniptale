// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as scenePlans from '../../features/video/review/advanced/scene';
import { ReviewZoomPreview } from './zoom-preview';
import type { ZoomPreviewFrame } from './use-zoom-preview-source';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const background = createQuickEditAdvancedState().background;

const region = (overrides?: Partial<QuickEditZoomRegion>): QuickEditZoomRegion => ({
  id: 'zoom-1',
  start: 2,
  end: 4,
  transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
  enter: { type: 'ease-in-out', duration: 0.3 },
  exit: { type: 'ease-in-out', duration: 0.3 },
  ...overrides,
});

const frame: ZoomPreviewFrame = {
  image: document.createElement('canvas'),
  width: 640,
  height: 360,
};

function renderPreview(args: {
  cursorFollowing?: boolean;
  focus?: ComponentProps<typeof ReviewZoomPreview>['focus'];
  region?: QuickEditZoomRegion;
  spatialEdit?: ComponentProps<typeof ReviewZoomPreview>['spatialEdit'];
  sourceTime?: number | null;
  loadFrame?: (sourceTime: number, signal: AbortSignal) => Promise<ZoomPreviewFrame>;
  onInteract?: (time: number) => void;
  onChange?: (patch: QuickEditZoomRegionPatch) => void;
  onPreview?: (patch: QuickEditZoomRegionPatch | null) => void;
}) {
  const onChange = args.onChange ?? vi.fn();
  const loadFrame = args.loadFrame === undefined ? vi.fn(async () => frame) : vi.fn(args.loadFrame);
  act(() => {
    root.render(
      <ReviewZoomPreview
        region={args.region ?? region()}
        focus={args.focus}
        cursorFollowing={args.cursorFollowing ?? false}
        {...(args.spatialEdit ? { spatialEdit: args.spatialEdit } : {})}
        background={background}
        source={{ width: 640, height: 360 }}
        sourceTime={args.sourceTime === undefined ? 3 : args.sourceTime}
        loadFrame={loadFrame}
        onInteract={args.onInteract}
        onChange={onChange}
        onPreview={args.onPreview}
      />
    );
  });
  const section = () =>
    host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.zoomPreview"]')!;
  const canvas = () => host.querySelector<HTMLCanvasElement>('canvas')!;
  return { onChange, loadFrame, section, canvas };
}

it('admits only the latest follow-camera plan after the inspector has a paint opportunity', async () => {
  vi.useFakeTimers();
  const ticks = new Map<number, FrameRequestCallback>();
  let tickId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    ticks.set(++tickId, callback);
    return tickId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => ticks.delete(id));
  const plan = vi.spyOn(scenePlans, 'resolveReviewSceneCameraPlan').mockReturnValue(null);
  const authored = region({
    cursorFocus: {
      path: {
        version: 1,
        mode: 'follow',
        smoothing: 0.5,
        sensitivity: 0.5,
        gapPolicy: 'hold',
        segments: [],
      },
    },
  });
  const loadFrame = vi.fn(async () => frame);
  const show = (current: QuickEditZoomRegion) =>
    act(() =>
      root.render(
        <ReviewZoomPreview
          region={current}
          focus={{ regions: [current], time: 3 }}
          background={background}
          source={{ width: 640, height: 360 }}
          sourceTime={3}
          loadFrame={loadFrame}
          onChange={vi.fn()}
        />
      )
    );
  show(authored);
  expect(plan).not.toHaveBeenCalled();
  const latest = { ...authored, transform: { ...authored.transform, scale: 1.3 } };
  show(latest);
  act(() => {
    const current = [...ticks.values()];
    ticks.clear();
    current.forEach((callback) => callback(0));
  });
  expect(plan).not.toHaveBeenCalled();
  await act(async () => vi.runOnlyPendingTimersAsync());
  expect(plan).toHaveBeenCalled();
  expect(plan.mock.calls.every((call) => call[1] === latest)).toBe(true);
  expect(
    host.querySelector('[data-ui="gallery.videoReview.zoomPreview"]')?.getAttribute('data-status')
  ).toBe('ready');
});

it('retains the completed follow preview during edits and drops it for another selection', async () => {
  vi.useFakeTimers();
  const ticks = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    ticks.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (key: number) => ticks.delete(key));
  const plan = vi.spyOn(scenePlans, 'resolveReviewSceneCameraPlan').mockReturnValue(null);
  const first = region({
    cursorFocus: {
      path: {
        version: 1,
        mode: 'follow',
        smoothing: 0.5,
        sensitivity: 0.5,
        gapPolicy: 'hold',
        segments: [],
      },
    },
  });
  const loadFrame = vi.fn(async () => frame);
  const change = vi.fn();
  const show = (selected: QuickEditZoomRegion) =>
    act(() =>
      root.render(
        <ReviewZoomPreview
          region={selected}
          focus={{ regions: [selected], time: 3 }}
          background={background}
          source={{ width: 640, height: 360 }}
          sourceTime={3}
          loadFrame={loadFrame}
          onChange={change}
        />
      )
    );
  const admit = async () => {
    act(() => {
      const current = [...ticks.values()];
      ticks.clear();
      current.forEach((callback) => callback(0));
    });
    await act(async () => vi.runOnlyPendingTimersAsync());
  };
  show(first);
  await admit();
  const canvas = host.querySelector('canvas');
  expect(canvas).not.toBeNull();
  const calls = plan.mock.calls.length;
  show({ ...first, transform: { ...first.transform, scale: 1.7 } });
  expect(plan).toHaveBeenCalledTimes(calls);
  expect(host.querySelector('canvas')).toBe(canvas);
  expect(canvas?.getAttribute('tabindex')).toBe('-1');
  await admit();
  expect(host.querySelector('canvas')).toBe(canvas);
  expect(loadFrame).toHaveBeenCalledOnce();
  show({ ...first, id: 'other-selection' });
  expect(host.querySelector('canvas')).toBeNull();
  await admit();
  expect(host.querySelector('canvas')).not.toBeNull();
  expect(change).not.toHaveBeenCalled();
});

it('cancels follow planning before admission when its preview unmounts', async () => {
  vi.useFakeTimers();
  const ticks = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    ticks.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (key: number) => ticks.delete(key));
  const plan = vi.spyOn(scenePlans, 'resolveReviewSceneCameraPlan').mockReturnValue(null);
  const selected = region({
    cursorFocus: {
      path: {
        version: 1,
        mode: 'follow',
        smoothing: 0.5,
        sensitivity: 0.5,
        gapPolicy: 'hold',
        segments: [],
      },
    },
  });
  renderPreview({ region: selected, focus: { regions: [selected], time: 3 } });
  expect(plan).not.toHaveBeenCalled();
  act(() => {
    const current = [...ticks.values()];
    ticks.clear();
    current.forEach((callback) => callback(0));
  });
  act(() => root.render(null));
  await act(async () => vi.runOnlyPendingTimersAsync());
  expect(plan).not.toHaveBeenCalled();
  expect(host.childElementCount).toBe(0);
});

it('reports a failed admitted plan and retries without authoring a camera change', async () => {
  vi.useFakeTimers();
  const ticks = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    ticks.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (key: number) => ticks.delete(key));
  const plan = vi
    .spyOn(scenePlans, 'resolveReviewSceneCameraPlan')
    .mockImplementationOnce(() => {
      throw new Error('Plan unavailable');
    })
    .mockReturnValue(null);
  const selected = region({
    cursorFocus: {
      path: {
        version: 1,
        mode: 'follow',
        smoothing: 0.5,
        sensitivity: 0.5,
        gapPolicy: 'hold',
        segments: [],
      },
    },
  });
  const view = renderPreview({ region: selected, focus: { regions: [selected], time: 3 } });
  const admit = async () => {
    act(() => {
      const current = [...ticks.values()];
      ticks.clear();
      current.forEach((callback) => callback(0));
    });
    await act(async () => vi.runOnlyPendingTimersAsync());
  };
  await admit();
  expect(view.section().getAttribute('data-status')).toBe('failed');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(plan).toHaveBeenCalledOnce();
  act(() => host.querySelector<HTMLButtonElement>('button')!.click());
  expect(plan).toHaveBeenCalledOnce();
  await admit();
  expect(view.section().getAttribute('data-status')).toBe('ready');
  expect(view.onChange).not.toHaveBeenCalled();
});

it('retains the completed follow plan throughout numeric drafts and prepares only the released value', async () => {
  vi.useFakeTimers();
  const ticks = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    ticks.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (key: number) => ticks.delete(key));
  const plan = vi.spyOn(scenePlans, 'resolveReviewSceneCameraPlan').mockReturnValue(null);
  const authored = region({
    cursorFocus: {
      path: {
        version: 1,
        mode: 'follow',
        smoothing: 0.5,
        sensitivity: 0.5,
        gapPolicy: 'hold',
        segments: [],
      },
    },
  });
  const loadFrame = vi.fn(async () => frame);
  const change = vi.fn();
  const show = (value: QuickEditZoomRegion, previewing: boolean) =>
    act(() =>
      root.render(
        <>
          <output>{value.transform.scale}</output>
          <ReviewZoomPreview
            region={value}
            cursorFollowing
            previewing={previewing}
            focus={{ regions: [value], time: 3 }}
            background={background}
            source={{ width: 640, height: 360 }}
            sourceTime={3}
            loadFrame={loadFrame}
            onChange={change}
          />
        </>
      )
    );
  const admit = async () => {
    act(() => {
      const current = [...ticks.values()];
      ticks.clear();
      current.forEach((callback) => callback(0));
    });
    await act(async () => vi.runOnlyPendingTimersAsync());
  };
  show(authored, false);
  await admit();
  const canvas = host.querySelector('canvas');
  const initialPlans = plan.mock.calls.length;
  expect(initialPlans).toBeGreaterThan(0);
  let latest = authored;
  for (const scale of [1.1, 1.2, 1.3]) {
    latest = { ...authored, transform: { ...authored.transform, scale } };
    show(latest, true);
    expect(host.querySelector('output')?.textContent).toBe(String(scale));
    await admit();
    expect(plan).toHaveBeenCalledTimes(initialPlans);
    expect(host.querySelector('canvas')).toBe(canvas);
  }
  show(latest, false);
  expect(plan).toHaveBeenCalledTimes(initialPlans);
  await admit();
  expect(plan.mock.calls.slice(initialPlans).every((call) => call[1] === latest)).toBe(true);
  expect(plan.mock.calls.length).toBeGreaterThan(initialPlans);
  expect(change).not.toHaveBeenCalled();
});
