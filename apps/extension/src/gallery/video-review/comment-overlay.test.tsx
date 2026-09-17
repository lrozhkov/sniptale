// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewCommentOverlay } from './comment-overlay';
import { createCanvasComment } from '../../features/video/review/comments';
import type { CanvasComment } from '../../features/video/review/types';
import type { QuickEditCameraTransform } from '../../features/video/review/advanced/types';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let root: Root;
let host: HTMLDivElement;
const onMove = vi.fn((_id: string, _position: { x: number; y: number }) => undefined);
const onSelect = vi.fn((_id: string) => undefined);

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  onMove.mockClear();
  onSelect.mockClear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const renderOverlay = (
  comments: CanvasComment[],
  time = 3,
  camera: QuickEditCameraTransform | null = null
) => {
  act(() => {
    root.render(
      <ReviewCommentOverlay
        comments={comments}
        output={{ width: 800, height: 450 }}
        source={{ width: 320, height: 180 }}
        background={{ enabled: false }}
        camera={camera}
        time={time}
        selectedId={comments[1]?.id ?? null}
        onSelect={onSelect}
        onMove={onMove}
        busy={false}
      />
    );
  });
  return [...host.querySelectorAll<HTMLElement>('[data-ui="gallery.videoReview.canvasComment"]')];
};

const drag = async (
  target: Element,
  path: Array<{ kind: string; x?: number; y?: number; key?: string }>
) => {
  Object.assign(target, { setPointerCapture: vi.fn() });
  for (const step of path) {
    if (step.kind === 'keydown') {
      await act(async () =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: step.key ?? 'Escape' }))
      );
      continue;
    }
    await act(async () =>
      target.dispatchEvent(
        new MouseEvent(step.kind, {
          bubbles: true,
          clientX: step.x ?? 0,
          clientY: step.y ?? 0,
          button: 0,
        })
      )
    );
  }
};

it('renders content comments through the camera transform and viewport comments fixed', () => {
  const content = {
    ...createCanvasComment({ id: 'c1' }),
    text: 'Look here',
    position: { x: 0.25, y: 0.5 },
  };
  const viewport = {
    ...createCanvasComment({ id: 'c2' }),
    attachment: 'viewport' as const,
    position: { x: 0.1, y: 0.25 },
  };
  const points = renderOverlay([content, viewport], 3, { scale: 2, centerX: 0.3, centerY: 0.4 });
  expect(points).toHaveLength(2);
  expect(points[0]!.style.left).toBe('160px');
  expect(points[0]!.style.top).toBe('270px');
  expect(points[0]!.style.zIndex).toBe('5');
  expect(points[1]!.style.left).toBe('80px');
  expect(points[1]!.style.top).toBe('112.5px');
  expect(points[1]!.style.zIndex).toBe('9');
  const bubble = host.querySelector('[data-ui="gallery.videoReview.canvasCommentBubble"]')!;
  expect(bubble).not.toBeNull();
  expect(bubble!.textContent).toBe('Look here');
  expect(host.querySelectorAll('[aria-label="gallery.videoReview.overlayPoint"]')).toHaveLength(2);
});

it('hides comments outside their optional time window', () => {
  const delayed = { ...createCanvasComment({ id: 'c1', at: 2 }), text: 'Later' };
  expect(renderOverlay([delayed], 1)).toHaveLength(0);
  expect(renderOverlay([delayed], 2)).toHaveLength(1);
  expect(renderOverlay([{ ...delayed, end: 3 }], 4)).toHaveLength(0);
});

it('commits content drags in content coordinates and restores nothing on escape', async () => {
  const comment = createCanvasComment({ id: 'c1' });
  const points = renderOverlay([comment], 3, { scale: 2, centerX: 0.3, centerY: 0.4 });
  await drag(points[0]!.querySelector('button')!, [
    { kind: 'pointerdown', x: 0, y: 0 },
    { kind: 'pointermove', x: 160, y: 90 },
    { kind: 'pointerup', x: 160, y: 90 },
  ]);
  expect(onMove).toHaveBeenCalledWith('c1', { x: 0.6, y: 0.6 });
  await drag(points[0]!.querySelector('button')!, [
    { kind: 'pointerdown', x: 0, y: 0 },
    { kind: 'pointermove', x: 100, y: 0 },
    { kind: 'keydown', key: 'Escape' },
    { kind: 'pointerup', x: 100, y: 0 },
  ]);
  expect(onMove).toHaveBeenCalledTimes(1);
});

it('clamps viewport drags to the output frame and ignores busy drags', async () => {
  const viewport = { ...createCanvasComment({ id: 'c2' }), attachment: 'viewport' as const };
  const points = renderOverlay([viewport], 3);
  await drag(points[0]!.querySelector('button')!, [
    { kind: 'pointerdown', x: 0, y: 0 },
    { kind: 'pointermove', x: 900, y: 600 },
    { kind: 'pointerup', x: 900, y: 600 },
  ]);
  expect(onMove).toHaveBeenCalledWith('c2', { x: 1, y: 1 });
  onMove.mockClear();
  const busyOverlay = act(() => {
    root.render(
      <ReviewCommentOverlay
        comments={[viewport]}
        output={{ width: 800, height: 450 }}
        source={{ width: 320, height: 180 }}
        background={{ enabled: false }}
        camera={null}
        time={3}
        selectedId={null}
        busy
        onSelect={onSelect}
        onMove={onMove}
      />
    );
  });
  await busyOverlay;
  await drag(host.querySelector('[data-ui="gallery.videoReview.canvasComment"] button')!, [
    { kind: 'pointerdown', x: 0, y: 0 },
    { kind: 'pointermove', x: 100, y: 100 },
    { kind: 'pointerup', x: 100, y: 0 },
  ]);
  expect(onMove).not.toHaveBeenCalled();
});

it('selects a comment point on click', async () => {
  const comment = createCanvasComment({ id: 'c1' });
  const points = renderOverlay([comment], 3);
  await act(async () => points[0]!.querySelector('button')!.click());
  expect(onSelect).toHaveBeenCalledWith('c1');
});
