// @vitest-environment jsdom
import { createVideoProjectCursorTrack } from '../../../../../features/video/project/defaults';
import * as previewRevision from '../../../../preview/cache/revision';
import { DEFAULT_CAMERA_PERSPECTIVE } from '../../../../../features/video/project/motion/spatial';
import { translate } from '../../../../../platform/i18n';
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
  camera: { scale: number; overlayZoomMode?: string };
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
  mocks.create.mockClear();
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
      renderFrame: (
        _time: number,
        signal: AbortSignal,
        camera: { scale: number; overlayZoomMode?: string }
      ) =>
        new Promise<HTMLCanvasElement>((resolve, reject) =>
          pending.push({ resolve, reject, signal, dispose, camera })
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
const button = () => host.querySelector<HTMLButtonElement>('[data-video-editor-local-navigation]')!;
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

it('renders the framed composition and commits a gesture in its displayed scene coordinates', async () => {
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
  const retry = host.querySelectorAll('button')[3]!;
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
  pointer('pointerup', 800, 600);
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
  expect(mocks.create).toHaveBeenCalledOnce();
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

it('coalesces camera edits during decoding and never presents a superseded composition', async () => {
  render(false, project, { ...region, scale: 0.5 });
  render(false, project, { ...region, scale: 0.75 });
  render(false, project, { ...region, scale: 1 });
  expect(pending).toHaveLength(1);
  expect(mocks.create).toHaveBeenCalledOnce();
  await ready(0);
  expect(draw).not.toHaveBeenCalled();
  expect(pending).toHaveLength(2);
  expect(pending[1]!.camera.scale).toBe(1);
  await ready(1);
  expect(draw).toHaveBeenCalledOnce();
  expect(button().disabled).toBe(false);
});

it.each(['LOCK_OVERLAYS', 'FOLLOW_CAMERA'] as const)(
  'passes %s at 50 percent without shrinking the canvas',
  async (overlayZoomMode) => {
    render(false, project, { ...region, scale: 0.5, overlayZoomMode });
    await ready();
    expect(pending[0]!.camera).toMatchObject({ scale: 0.5, overlayZoomMode });
    const canvas = host.querySelector('canvas')!;
    expect(canvas.style.width).toBe('100%');
    expect(canvas.style.height).toBe('100%');
    expect(mocks.create).toHaveBeenCalledOnce();
  }
);

it('shows a full-scene navigator and switches to the composed result without another decoder', async () => {
  render();
  await ready();
  setupBounds();
  expect(pending[0]!.camera.scale).toBe(1);
  const result = host.querySelectorAll('button')[1]!;
  act(() => result.click());
  expect(pending[1]!.camera.scale).toBe(2);
  await ready(1);
  pointer('pointerdown', 100, 100);
  pointer('pointerup', 200, 120);
  expect(commit).not.toHaveBeenCalled();
  expect(mocks.create).toHaveBeenCalledOnce();
});

it('uses the presented spatial region for the thumbnail without authoring its accepted target', async () => {
  const panel = createMotionPanelProps();
  const selected = panel.selectedMotionRegion!;
  const displayed = {
    ...selected,
    perspective: { ...DEFAULT_CAMERA_PERSPECTIVE, enabled: true, rotateY: 35 },
  };
  panel.project = { ...panel.project, motionRegions: [displayed] };
  panel.onUpdateMotionRegion = vi.fn();
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
  const result = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent === translate('videoEditor.sidebar.framingResultView')
  )!;
  act(() => result.click());
  expect(pending.at(-1)!.camera).toMatchObject({
    spatial: {
      perspective: 0.5,
      rotation: [
        0,
        expect.closeTo(Math.sin((35 * Math.PI) / 360), 12),
        0,
        expect.closeTo(Math.cos((35 * Math.PI) / 360), 12),
      ],
    },
  });
  expect(selected.perspective).toBeUndefined();
  expect(panel.onUpdateMotionRegion).not.toHaveBeenCalled();
});

it.each(['available', 'outside', 'missing'] as const)(
  'keeps source-window framing edits safe for target: %s',
  async (target) => {
    const { createVideoProjectFromRecording } =
      await import('../../../../../features/video/project/factories/creation');
    const next = createVideoProjectFromRecording({
      recordingId: 'window',
      filename: 'Window.webm',
      width: 800,
      height: 600,
      duration: 4,
      mimeType: 'video/webm',
      size: 100,
      hasAudio: false,
    });
    const clip = next.clips[0]!;
    if (clip.type !== 'VIDEO') throw new Error('Expected video');
    clip.transform = { x: 200, y: 150, width: 400, height: 300, opacity: 1, rotation: 0 };
    clip.sourceCrop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
    const selected = {
      ...createVideoProjectMotionRegion(next, 0),
      duration: 4,
      scale: 2,
      focusPoint: { x: 300, y: 250 },
      sourceBinding: {
        clipId: target === 'missing' ? 'missing' : clip.id,
        coordinateSpace: 'source-window' as const,
        sourceStart: 0,
        sourceEnd: 4,
        animation: { start: 0, end: 4, duration: 4 },
      },
    };
    next.motionRegions = [selected];
    if (target === 'outside') clip.startTime = 5;
    const before = structuredClone(next);
    render(false, next, selected);
    await ready();
    setupBounds();
    if (target !== 'available') {
      pointer('pointerdown', 180, 150);
      pointer('pointerup', 190, 150);
      act(() =>
        button().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      );
      expect(commit).not.toHaveBeenCalled();
      expect(commitArea).not.toHaveBeenCalled();
      expect(next).toEqual(before);
      return;
    }
    pointer('pointerdown', 180, 150);
    pointer('pointermove', 190, 150);
    expect(commit).not.toHaveBeenCalled();
    pointer('pointerup', 190, 150);
    expect(commit).toHaveBeenCalledExactlyOnceWith({ x: 332, y: 250 });
    commit.mockClear();
    pointer('pointerdown', 180, 150);
    pointer('pointermove', 200, 170);
    pointer('pointercancel', 200, 170);
    pointer('pointerup', 200, 170);
    expect(commit).not.toHaveBeenCalled();
    expect(next).toEqual(before);
  }
);

it('shows and resizes the actual rotated source-window area without changing the opposite corner', async () => {
  const { createVideoProjectFromRecording } =
    await import('../../../../../features/video/project/factories/creation');
  const next = createVideoProjectFromRecording({
    recordingId: 'rotated-area',
    filename: 'Area.webm',
    width: 800,
    height: 600,
    duration: 4,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
  });
  const clip = next.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  clip.transform = { x: 200, y: 150, width: 400, height: 300, opacity: 1, rotation: 90 };
  const selected = {
    ...createVideoProjectMotionRegion(next, 0),
    duration: 4,
    focusMode: VideoMotionFocusMode.MANUAL_AREA,
    focusArea: { x: 200, y: 150, width: 400, height: 300 },
    sourceBinding: {
      clipId: clip.id,
      coordinateSpace: 'source-window' as const,
      sourceStart: 0,
      sourceEnd: 4,
      animation: { start: 0, end: 4, duration: 4 },
    },
  };
  next.motionRegions = [selected];
  const before = structuredClone(next);
  render(false, next, selected);
  await ready();
  setupBounds();
  const nw = host.querySelector<HTMLElement>('[data-framing-corner="nw"]')!;
  const se = host.querySelector<HTMLElement>('[data-framing-corner="se"]')!;
  expect(parseFloat(nw.style.left)).toBeCloseTo(59.375, 8);
  expect(parseFloat(nw.style.top)).toBeCloseTo(33.3333333333, 8);
  expect(parseFloat(se.style.left)).toBeCloseTo(40.625, 8);
  expect(parseFloat(se.style.top)).toBeCloseTo(66.6666666667, 8);
  pointer('pointerdown', 162.5, 200, se);
  pointer('pointermove', 150, 225);
  expect(commitArea).not.toHaveBeenCalled();
  pointer('pointerup', 150, 225);
  expect(commitArea).toHaveBeenCalledExactlyOnceWith({ x: 200, y: 150, width: 500, height: 350 });
  expect(commit).not.toHaveBeenCalled();
  expect(next).toEqual(before);
});

it('fits every rotated area handle and freezes the overview while a corner follows the pointer', async () => {
  const { createVideoProjectFromRecording } =
    await import('../../../../../features/video/project/factories/creation');
  const next = createVideoProjectFromRecording({
    recordingId: 'area-clearance',
    filename: 'Area.webm',
    width: 800,
    height: 600,
    duration: 4,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
  });
  const clip = next.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  clip.transform = { x: 40, y: 30, width: 720, height: 540, rotation: 30, opacity: 1 };
  const selected = {
    ...createVideoProjectMotionRegion(next, 0),
    duration: 4,
    focusMode: VideoMotionFocusMode.MANUAL_AREA,
    focusArea: { x: 0, y: 0, width: 800, height: 600 },
    sourceBinding: {
      clipId: clip.id,
      coordinateSpace: 'source-window' as const,
      sourceStart: 0,
      sourceEnd: 4,
      animation: { start: 0, end: 4, duration: 4 },
    },
  };
  next.motionRegions = [selected];
  const before = structuredClone(next);
  render(false, next, selected);
  await ready();
  setupBounds();
  for (const corner of host.querySelectorAll<HTMLElement>('[data-framing-corner]')) {
    expect(parseFloat(corner.style.left)).toBeGreaterThan(2);
    expect(parseFloat(corner.style.left)).toBeLessThan(98);
    expect(parseFloat(corner.style.top)).toBeGreaterThan(2);
    expect(parseFloat(corner.style.top)).toBeLessThan(98);
  }
  const corner = host.querySelector<HTMLElement>('[data-framing-corner="nw"]')!;
  const left = parseFloat(corner.style.left),
    top = parseFloat(corner.style.top);
  pointer('pointerdown', left * 4, top * 3, corner);
  pointer('pointermove', left * 4 + 4, top * 3 + 8);
  await act(async () => {});
  const moved = host.querySelector<HTMLElement>('[data-framing-corner="nw"]')!;
  expect(parseFloat(moved.style.left)).toBeCloseTo(left + 1, 8);
  expect(parseFloat(moved.style.top)).toBeCloseTo(top + 8 / 3, 8);
  expect(commitArea).not.toHaveBeenCalled();
  expect(pending).toHaveLength(1);
  pointer('pointercancel', left * 4 + 4, top * 3 + 8);
  pointer('pointerup', left * 4 + 4, top * 3 + 8);
  expect(commitArea).not.toHaveBeenCalled();
  expect(next).toEqual(before);
});

it('resizes a converted scene area along its retained edges with one commit', async () => {
  const next = createEmptyVideoProject('Converted scene area', 800, 600);
  const axes = { x: { x: Math.sqrt(3) / 2, y: 0.5 }, y: { x: -0.5, y: Math.sqrt(3) / 2 } };
  const area = { x: 300, y: 150, width: 200, height: 160, axes };
  const selected = {
    ...createVideoProjectMotionRegion(next, 0),
    duration: 2,
    focusMode: VideoMotionFocusMode.MANUAL_AREA,
    focusArea: area,
  };
  next.motionRegions = [selected];
  const before = structuredClone(next);
  render(false, next, selected);
  await ready();
  setupBounds();
  const corner = host.querySelector<HTMLElement>('[data-framing-corner="se"]')!;
  const x = parseFloat(corner.style.left) * 4,
    y = parseFloat(corner.style.top) * 3;
  const dx = (40 * axes.x.x + 20 * axes.y.x) / 2,
    dy = (40 * axes.x.y + 20 * axes.y.y) / 2;
  pointer('pointerdown', x, y, corner);
  pointer('pointermove', x + dx, y + dy);
  expect(commitArea).not.toHaveBeenCalled();
  pointer('pointerup', x + dx, y + dy);
  expect(commitArea).toHaveBeenCalledExactlyOnceWith({
    ...area,
    width: expect.closeTo(240, 8),
    height: expect.closeTo(180, 8),
  });
  expect(next).toEqual(before);
});

it('does not serialize the project identity again for framing camera updates', async () => {
  render();
  await ready();
  const stringify = vi.spyOn(JSON, 'stringify');
  render(false, project, { ...region, scale: 3 });
  const wrappedIdentities = stringify.mock.calls.filter(
    ([value]) =>
      Array.isArray(value) && typeof value[0] === 'string' && value[0].includes('"cursorTrack"')
  );
  expect(wrappedIdentities).toHaveLength(0);
  expect(mocks.create).toHaveBeenCalledOnce();
});

it('reuses immutable framing source identity through motion-only project updates', async () => {
  const identity = vi.spyOn(previewRevision, 'createVideoPreviewRenderIdentity');
  render();
  await ready();
  identity.mockClear();
  for (const scale of [2.1, 2.2, 2.3]) {
    const next = { ...region, scale };
    render(false, { ...project, motionRegions: [next], updatedAt: project.updatedAt + 1 }, next);
  }
  expect(identity).not.toHaveBeenCalled();
  expect(mocks.create).toHaveBeenCalledOnce();
  const changed = { ...project, backgroundColor: '#123456' };
  render(false, changed, region);
  expect(identity).toHaveBeenCalledOnce();
  expect(mocks.create).toHaveBeenCalledTimes(2);
  identity.mockClear();
  render(false, { ...changed, cursorTrack: createVideoProjectCursorTrack() }, region);
  expect(identity).toHaveBeenCalledOnce();
});
