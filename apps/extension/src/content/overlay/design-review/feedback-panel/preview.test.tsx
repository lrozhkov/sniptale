// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
import { FeedbackPreview } from './preview';

const scale = vi.hoisted(() => ({ value: 1 }));
vi.mock('../../../platform/dom-host', async (original) => ({
  ...(await original<typeof import('../../../platform/dom-host')>()),
  useContentUiScale: () => scale.value,
}));
let root: Root;
let anchor: HTMLButtonElement;
let anchorRect: DOMRect;
let previewRect: DOMRect;
let clipRect: DOMRect;
let resize: () => void;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1000);
  vi.stubGlobal('innerHeight', 700);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
  scale.value = 1;
  const container = document.createElement('div');
  const clip = document.createElement('div');
  anchor = document.createElement('button');
  clip.append(anchor);
  document.body.append(container, clip);
  root = createRoot(container);
  anchorRect = new DOMRect(100, 200, 200, 50);
  previewRect = new DOMRect(0, 0, 300, 180);
  clipRect = new DOMRect(90, 50, 220, 600);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      return this === anchor ? anchorRect : this === clip ? clipRect : previewRect;
    }
  );
});
afterEach(() => {
  act(() => root.unmount());
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount() {
  browserAnnotationSession.setComment({
    target: anchor,
    comment: 'Review',
    evidence: {
      fileLabel: 'Page',
      frame: { kind: 'top-document' },
      locator: 'button',
      nodePosition: { x: 0, y: 0 },
      pageUrl: 'https://example.test',
      targetPath: 'button',
      targetSelector: 'button',
      targetText: 'Test',
      viewport: { width: 1000, height: 700 },
    },
  });
  const record = browserAnnotationSession.getState().domRecords[0]!;
  act(() =>
    root.render(<FeedbackPreview anchor={anchor} record={record} summary="Review" label="Button" />)
  );
  return document.querySelector<HTMLElement>('[data-ui="content.design-review.feedback-preview"]')!;
}
it.each([60, 200, 500])('aligns the preview with the row at y=%i', (y) => {
  anchorRect = new DOMRect(100, y, 200, 40);
  const preview = mount();
  expect(preview.style.top).toBe(`${y}px`);
  expect(preview.style.left).toBe('312px');
  expect(preview.parentElement).toBe(document.body);
});
it('flips left, clamps measured height and refreshes after scroll, resize and clipping', () => {
  anchorRect = new DOMRect(700, 610, 200, 40);
  const preview = mount();
  expect(preview.style.left).toBe('388px');
  expect(preview.style.top).toBe('508px');
  previewRect = new DOMRect(0, 0, 300, 400);
  act(() => resize());
  expect(preview.style.top).toBe('288px');
  anchorRect = new DOMRect(700, 150, 200, 40);
  act(() => anchor.parentElement?.dispatchEvent(new Event('scroll')));
  expect(preview.style.top).toBe('150px');
  anchorRect = new DOMRect(700, 660, 200, 40);
  act(() => window.dispatchEvent(new Event('resize')));
  expect(preview.style.visibility).toBe('hidden');
});
it('uses client coordinates with scaled chrome and a constrained visual viewport', () => {
  scale.value = 0.5;
  previewRect = new DOMRect(0, 0, 150, 90);
  const viewport = new EventTarget();
  Object.assign(viewport, { offsetLeft: 0, offsetTop: 100, width: 280, height: 300 });
  vi.stubGlobal('visualViewport', viewport);
  const preview = mount();
  expect(preview.style.scale).toBe('0.5');
  expect(preview.style.left).toBe('100px');
  expect(preview.style.top).toBe('256px');
  expect(preview.style.maxHeight).toBe('552px');
  anchor.remove();
  act(() => viewport.dispatchEvent(new Event('scroll')));
  expect(preview.style.visibility).toBe('hidden');
});

it.each([
  { rowY: 220, expectedY: 49 },
  { rowY: 20, expectedY: 116 },
])(
  'uses adjacent vertical room before covering a constrained row at $rowY',
  ({ rowY, expectedY }) => {
    vi.stubGlobal('innerWidth', 540);
    vi.stubGlobal('innerHeight', 350);
    anchorRect = new DOMRect(32, rowY, 392, 84);
    previewRect = new DOMRect(0, 0, 300, 159);
    clipRect = new DOMRect(24, 12, 408, 326);
    const preview = mount();
    expect(preview.style.left).toBe('32px');
    expect(preview.style.top).toBe(`${expectedY}px`);
  }
);
