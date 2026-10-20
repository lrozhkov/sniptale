// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createVideoProjectFromRecording } from '../../../../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../../../features/video/project/motion';
import { normalizeVideoProjectCursorSkin } from '../../../../../features/video/project/cursor';
import {
  VideoCursorCaptureMode,
  VideoMotionFocusMode,
} from '../../../../../features/video/project/types';
import { useFramingInteraction } from './framing-preview-interaction';
import { FramingPreviewSurface } from './framing-preview';

vi.mock('../../../../preview/cache/materializer', () => ({
  createVideoPreviewFrameMaterializer: () => ({
    dispose: vi.fn(),
    renderFrame: async () => document.createElement('canvas'),
  }),
}));
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({ drawImage: vi.fn() }),
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'follow',
    filename: 'follow.webm',
    width: 1000,
    height: 600,
    duration: 3,
    mimeType: 'video/webm',
    size: 10,
    cursorTrack: {
      captureMode: VideoCursorCaptureMode.EMBEDDED_FALLBACK,
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [0, 3].map((time) => ({
        id: `sample-${time}`,
        time,
        x: 570,
        y: 300,
        visible: true,
        recordingPoint: { x: 0.57, y: 0.5 },
        captureSegment: 0,
      })),
    },
  });
  const region = {
    ...createVideoProjectMotionRegion(project, 0),
    duration: 3,
    scale: 1.2,
    focusMode: VideoMotionFocusMode.CURSOR,
    zoomInDuration: 0,
    zoomOutDuration: 0,
  };
  project.motionRegions = [region];
  return { project, region, assetUrls: {}, onCommit: vi.fn() };
}
it('projects the admitted following camera into the inspector result viewport', () => {
  const props = fixture();
  const before = structuredClone(props.project);
  function Result() {
    const view = useFramingInteraction(props, false);
    return (
      <output>
        {JSON.stringify({ left: view.left, top: view.top, width: view.width, height: view.height })}
      </output>
    );
  }
  act(() => root.render(<Result />));
  const view = JSON.parse(host.textContent!);
  expect(view.left).toBeCloseTo(570 - 1000 / 1.2 / 2, 8);
  expect(view.top).toBeCloseTo(50, 8);
  expect(view.width).toBeCloseTo(1000 / 1.2, 8);
  expect(view.height).toBeCloseTo(500, 8);
  expect(props.project).toEqual(before);
});
it('keeps the real following preview read-only for pointer and keyboard interactions', async () => {
  const props = fixture();
  const before = structuredClone(props.project);
  await act(async () => root.render(<FramingPreviewSurface {...props} />));
  const button = host.querySelector<HTMLButtonElement>('[data-video-editor-local-navigation]')!;
  expect(button.disabled).toBe(false);
  act(() => {
    button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    button.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
  });
  expect(props.onCommit).not.toHaveBeenCalled();
  expect(props.project).toEqual(before);
});

it('does not report export camera conflicts for a hidden camera lane', async () => {
  const props = fixture();
  props.region = { ...props.region, scale: 4, zoomInDuration: 0.01 };
  props.project.motionRegions = [props.region];
  props.project.utilityLanes = {
    actions: { visible: true, locked: false },
    camera: { visible: false, locked: false },
  };
  await act(async () => root.render(<FramingPreviewSurface {...props} />));
  expect(host.querySelector('[role="status"]')).toBeNull();
});

it.each([
  VideoMotionFocusMode.MANUAL,
  VideoMotionFocusMode.MANUAL_AREA,
  VideoMotionFocusMode.CURSOR,
])(
  'shows the selected %s spatial target independently of transition progress and keeps overview neutral',
  (focusMode) => {
    const original = fixture();
    const region = {
      ...original.region,
      focusMode,
      zoomInDuration: 2.5,
      zoomOutDuration: 0.5,
      phaseTransitions: { enter: 'linear' as const, exit: 'linear' as const },
      perspective: { enabled: true, rotateX: 0, rotateY: 35, rotateZ: 0, strength: 1 },
      depthOfField: {
        enabled: true,
        mode: 'area' as const,
        x: 0.2,
        y: 0.3,
        width: 0.1,
        softness: 0.2,
        strength: 0.8,
      },
      spatialReference: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
      ...(focusMode === VideoMotionFocusMode.MANUAL_AREA
        ? { focusArea: { x: 100, y: 100, width: 400, height: 240 } }
        : {}),
    };
    const props = {
      ...original,
      region,
      project: { ...original.project, version: 19 as const, motionRegions: [region] },
    };
    const before = structuredClone(props.project);
    const inspect = vi.fn();
    function View({ overview }: { overview: boolean }) {
      inspect(useFramingInteraction(props, overview).camera);
      return null;
    }
    act(() => root.render(<View overview={false} />));
    expect(inspect.mock.lastCall?.[0]).toMatchObject({
      spatial: {
        rotation: [
          0,
          expect.closeTo(Math.sin((17.5 * Math.PI) / 180), 9),
          0,
          expect.closeTo(Math.cos((17.5 * Math.PI) / 180), 9),
        ],
        perspective: 1,
        reference: { x: 100, y: 120, width: 500, height: 360 },
        focus: [{ settings: region.depthOfField, weight: 1 }],
      },
    });
    act(() => root.render(<View overview={true} />));
    expect(inspect.mock.lastCall?.[0].spatial).toBeUndefined();
    expect(props.project).toEqual(before);
    expect(props.onCommit).not.toHaveBeenCalled();
  }
);
