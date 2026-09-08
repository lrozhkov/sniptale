// @vitest-environment jsdom
import { VideoMotionFocusMode } from '../../../../../features/video/project/types';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../../../features/video/project/motion';
import { FramingPreviewSurface, MotionFramingPreview } from './framing-preview';
import { createMotionPanelProps } from './test-support';
import { RuntimePreviewContext } from '../../../../runtime/controller/composition/contexts';

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../../../../preview/cache/materializer', () => ({
  createVideoPreviewFrameMaterializer: mocks.create,
}));
let root: Root;
let host: HTMLDivElement;
const draw = vi.fn();
const pending: {
  resolve: (canvas: HTMLCanvasElement) => void;
  reject: (error: Error) => void;
  signal: AbortSignal;
  dispose: ReturnType<typeof vi.fn>;
}[] = [];
const project = createEmptyVideoProject('Frame', 800, 600);
const region = { ...createVideoProjectMotionRegion(project, 0), scale: 2 };
const assetUrls = {};
const commit = vi.fn();
const commitArea = vi.fn();
const areaRegion = {
  ...region,
  focusMode: VideoMotionFocusMode.MANUAL_AREA,
  focusArea: { x: 200, y: 150, width: 400, height: 300 },
};

beforeEach(() => {
  pending.length = 0;
  draw.mockClear();
  commit.mockClear();
  commitArea.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({ drawImage: draw }),
  });
  mocks.create.mockImplementation(() => {
    const dispose = vi.fn();
    return {
      dispose,
      renderFrame: (_time: number, signal: AbortSignal) =>
        new Promise<HTMLCanvasElement>((resolve, reject) =>
          pending.push({ resolve, reject, signal, dispose })
        ),
    };
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
const render = (locked = false, nextProject = project, nextRegion = region, nextUrls = assetUrls) =>
  act(() =>
    root.render(
      <fieldset disabled={locked}>
        <FramingPreviewSurface
          project={nextProject}
          region={nextRegion}
          assetUrls={nextUrls}
          onCommit={commit}
          onCommitArea={commitArea}
        />
      </fieldset>
    )
  );
const ready = async (index = 0) =>
  act(async () => {
    pending[index]!.resolve(document.createElement('canvas'));
  });
const button = () => host.querySelector('button')!;
const pointer = (type: string, x: number, y: number, target?: Element) =>
  act(() => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    (target ?? button()).dispatchEvent(event);
  });
function setupBounds() {
  button().getBoundingClientRect = () => new DOMRect(0, 0, 400, 300);
  button().setPointerCapture = vi.fn();
  button().releasePointerCapture = vi.fn();
}

it('renders the actual composition without zoom and commits one completed pointer gesture', async () => {
  render();
  expect(button().disabled).toBe(true);
  await ready();
  setupBounds();
  expect(mocks.create.mock.lastCall?.[0].project.motionRegions).toEqual([]);
  expect(draw).toHaveBeenCalledOnce();
  pointer('pointerdown', 100, 100);
  pointer('pointermove', 150, 110);
  expect(commit).not.toHaveBeenCalled();
  pointer('pointerup', 200, 120);
  expect(commit).toHaveBeenCalledExactlyOnceWith({ x: 600, y: 340 });
});

it('cancels a draft and respects the locked fieldset for pointer and keyboard edits', async () => {
  render();
  await ready();
  setupBounds();
  pointer('pointerdown', 20, 30);
  pointer('pointercancel', 20, 30);
  pointer('pointerup', 200, 120);
  expect(commit).not.toHaveBeenCalled();
  pointer('pointerdown', 20, 30);
  act(() => button().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  pointer('pointerup', 200, 120);
  expect(commit).not.toHaveBeenCalled();
  act(() =>
    button().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  );
  expect(commit).toHaveBeenCalledExactlyOnceWith({ x: 401, y: 300 });
  commit.mockClear();
  render(true);
  setupBounds();
  pointer('pointerdown', 20, 30);
  pointer('pointerup', 100, 120);
  act(() =>
    button().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  );
  expect(commit).not.toHaveBeenCalled();
});

it('disposes stale rendering, ignores its result and offers retry after a current failure', async () => {
  render();
  const replacement = { ...project, backgroundColor: '#000000' };
  render(false, replacement);
  expect(pending[0]!.signal.aborted).toBe(true);
  expect(pending[0]!.dispose).toHaveBeenCalledOnce();
  await ready(0);
  expect(draw).not.toHaveBeenCalled();
  expect(button().disabled).toBe(true);
  await act(async () => pending[1]!.reject(new Error('decode failed')));
  const retry = host.querySelectorAll('button')[1]!;
  expect(retry).toBeDefined();
  act(() => retry.click());
  expect(pending[1]!.dispose).toHaveBeenCalledOnce();
  await ready(2);
  expect(button().disabled).toBe(false);
});

it('moves the selected area in scene coordinates with one commit and clamps it inside the scene', async () => {
  render(false, project, areaRegion);
  await ready();
  setupBounds();
  pointer('pointerdown', 150, 100);
  pointer('pointermove', 200, 125);
  expect(commitArea).not.toHaveBeenCalled();
  pointer('pointerup', 200, 125);
  expect(commitArea).toHaveBeenCalledExactlyOnceWith({ x: 300, y: 200, width: 400, height: 300 });
  expect(commit).not.toHaveBeenCalled();
  commitArea.mockClear();
  pointer('pointerdown', 150, 100);
  pointer('pointerup', 600, 600);
  expect(commitArea).toHaveBeenCalledExactlyOnceWith({ x: 400, y: 300, width: 400, height: 300 });
});

it('resizes from a corner while retaining the opposite corner and stops at minimum size', async () => {
  render(false, project, areaRegion);
  await ready();
  setupBounds();
  const corner = host.querySelector('[data-framing-corner="nw"]')!;
  expect((corner as HTMLElement).style.cursor).toBe('nwse-resize');
  pointer('pointerdown', 100, 75, corner);
  pointer('pointermove', 120, 90);
  expect(commitArea).not.toHaveBeenCalled();
  pointer('pointerup', 120, 90);
  expect(commitArea).toHaveBeenCalledExactlyOnceWith({ x: 240, y: 180, width: 360, height: 270 });
  commitArea.mockClear();
  pointer('pointerdown', 100, 75, corner);
  pointer('pointerup', 400, 300);
  expect(commitArea).toHaveBeenCalledExactlyOnceWith({ x: 552, y: 402, width: 48, height: 48 });
});

it('cancels area resize and routes keyboard motion to area instead of point focus', async () => {
  render(false, project, areaRegion);
  await ready();
  setupBounds();
  pointer('pointerdown', 300, 225, host.querySelector('[data-framing-corner="se"]')!);
  pointer('pointermove', 350, 260);
  pointer('pointercancel', 350, 260);
  pointer('pointerup', 350, 260);
  expect(commitArea).not.toHaveBeenCalled();
  act(() =>
    button().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })
    )
  );
  expect(commitArea).toHaveBeenCalledExactlyOnceWith({ x: 210, y: 150, width: 400, height: 300 });
  expect(commit).not.toHaveBeenCalled();
  commitArea.mockClear();
  render(true, project, areaRegion);
  pointer('pointerdown', 300, 225, host.querySelector('[data-framing-corner="se"]')!);
  pointer('pointerup', 350, 260);
  expect(commitArea).not.toHaveBeenCalled();
});

it('omits the framing surface without a preview runtime', () => {
  const panel = createMotionPanelProps();
  act(() => root.render(<MotionFramingPreview motionRegion={region} panel={panel} />));
  expect(host.childElementCount).toBe(0);
});

it.each([false, true])(
  'commits the inspector focus mode through the mounted preview, area=%s',
  async (areaMode) => {
    const panel = createMotionPanelProps();
    panel.project = project;
    panel.onClearPlacementMode = vi.fn();
    panel.onUpdateMotionRegion = vi.fn();
    const selected = areaMode ? areaRegion : { ...region, focusPoint: { x: 300, y: 250 } };
    act(() =>
      root.render(
        <RuntimePreviewContext.Provider
          value={{
            assetUrls,
            registerPreviewRuntime: vi.fn(),
            setTimelinePreviewSuspended: vi.fn(),
            setTimelinePreviewViewport: vi.fn(),
            timelinePreviews: {},
          }}
        >
          <MotionFramingPreview motionRegion={selected} panel={panel} />
        </RuntimePreviewContext.Provider>
      )
    );
    await ready();
    act(() =>
      button().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    );
    expect(panel.onClearPlacementMode).toHaveBeenCalledOnce();
    expect(panel.onUpdateMotionRegion).toHaveBeenCalledWith(
      region.id,
      areaMode
        ? {
            focusMode: VideoMotionFocusMode.MANUAL_AREA,
            focusArea: { ...areaRegion.focusArea, x: 201 },
          }
        : { focusMode: VideoMotionFocusMode.MANUAL, focusPoint: { x: 301, y: 250 } }
    );
  }
);

it('retains a decoded frame through focus edits and autosave metadata changes', async () => {
  render(false, project, areaRegion);
  await ready();
  const editedRegion = { ...areaRegion, focusArea: { ...areaRegion.focusArea, x: 250 } };
  render(
    false,
    { ...project, updatedAt: project.updatedAt + 1, motionRegions: [editedRegion] },
    editedRegion
  );
  expect(button().disabled).toBe(false);
  expect(pending).toHaveLength(1);
  expect(draw).toHaveBeenCalledOnce();
});

it('does not cancel a pending decode for focus-only changes', async () => {
  render();
  render(false, {
    ...project,
    updatedAt: project.updatedAt + 1,
    motionRegions: [{ ...region, scale: 3 }],
  });
  expect(pending).toHaveLength(1);
  expect(pending[0]!.signal.aborted).toBe(false);
  await ready();
  expect(button().disabled).toBe(false);
});

it('refreshes the frame when the sampled zoom time changes', async () => {
  const timedProject = { ...project, duration: 10 };
  render(false, timedProject, { ...region, startTime: 0, duration: 2 });
  await ready();
  render(false, timedProject, { ...region, startTime: 4, duration: 2 });
  expect(button().disabled).toBe(true);
  expect(pending).toHaveLength(2);
  await ready(1);
  expect(button().disabled).toBe(false);
});

it('reuses equivalent project snapshots but refreshes changed media URLs', async () => {
  render();
  await ready();
  render(false, structuredClone(project), region, {});
  expect(pending).toHaveLength(1);
  expect(button().disabled).toBe(false);
  render(false, project, region, { source: 'blob:replacement' });
  expect(pending).toHaveLength(2);
  expect(button().disabled).toBe(true);
  await ready(1);
  expect(button().disabled).toBe(false);
});
