// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewZoomInspector } from './zoom-inspector';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const region: QuickEditZoomRegion = {
  id: 'zoom-1',
  start: 2,
  end: 4,
  transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
  enter: { type: 'ease-in-out', duration: 0.3 },
  exit: { type: 'ease-in-out', duration: 0.3 },
};

function renderInspector(
  onChange: (patch: QuickEditZoomRegionPatch) => void,
  onReset = vi.fn(),
  onDelete = vi.fn()
) {
  act(() => {
    root.render(
      <ReviewZoomInspector
        region={region}
        onChange={onChange}
        onReset={onReset}
        onDelete={onDelete}
      />
    );
  });
  const field = (label: string) =>
    host.querySelector<HTMLInputElement>(`[aria-label="gallery.videoReview.${label}"]`)!;
  const set = async (node: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const select = host.querySelector<HTMLButtonElement>(
    '[aria-label="gallery.videoReview.zoomTransitionIn"]'
  )!;
  return { field, set, select };
}

it('skips empty numeric input without committing a partial camera value', async () => {
  const change = vi.fn((_patch: QuickEditZoomRegionPatch) => undefined);
  const inspector = renderInspector(change);
  await inspector.set(inspector.field('zoomScale'), 'not-a-number');
  expect(change).not.toHaveBeenCalled();
});

it('commits camera fields, transitions, reset, and delete through the callbacks', async () => {
  const change = vi.fn((_patch: QuickEditZoomRegionPatch) => undefined);
  const reset = vi.fn();
  const remove = vi.fn();
  const inspector = renderInspector(change, reset, remove);
  await inspector.set(inspector.field('zoomScale'), '2');
  expect(change).toHaveBeenLastCalledWith({ scale: 2 });
  await inspector.set(inspector.field('zoomFocusX'), '0.3');
  expect(change).toHaveBeenLastCalledWith({ centerX: 0.3 });
  await inspector.set(inspector.field('zoomFocusY'), '0.8');
  expect(change).toHaveBeenLastCalledWith({ centerY: 0.8 });
  await act(async () => inspector.select.click());
  await act(async () =>
    document.querySelectorAll<HTMLButtonElement>('[role="option"]')[1]!.click()
  );
  expect(change).toHaveBeenLastCalledWith({ enter: { type: 'linear', duration: 0.3 } });
  await inspector.set(
    inspector.field('zoomTransitionIn gallery.videoReview.zoomTransitionDuration'),
    '0.5'
  );
  expect(change).toHaveBeenLastCalledWith({ enter: { type: 'ease-in-out', duration: 0.5 } });
  await act(async () => inspector.field('zoomResetPosition')!.closest('button')!.click());
  expect(reset).toHaveBeenCalledOnce();
  const buttons = [...host.querySelectorAll('button')];
  await act(async () => buttons[buttons.length - 1]!.click());
  expect(remove).toHaveBeenCalledOnce();
});
