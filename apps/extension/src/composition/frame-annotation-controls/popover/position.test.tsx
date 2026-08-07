// @vitest-environment jsdom
import { act, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { useFrameAnnotationSettingsPopoverPosition } from './position';
import { useFrameAnnotationPopoverPresentation } from './presentation';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it.each([
  ['horizontal', { left: 100, top: 140 }],
  ['vertical', { left: 550, top: 100 }],
] as const)(
  'places %s main-toolbar menus outside the complete toolbar',
  (displayMode, expected) => {
    const toolbar = document.createElement('div');
    toolbar.className = 'sniptale-toolbar';
    toolbar.dataset['displayMode'] = displayMode;
    const anchor = document.createElement('button');
    toolbar.append(anchor);
    document.body.append(toolbar);
    vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue(
      createRect({ left: 50, top: 80, width: 500, height: 50 })
    );
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(
      createRect({ left: 100, top: 100, width: 40, height: 30 })
    );
    let style: CSSProperties | null = null;
    const popoverRef = { current: null };

    function Harness() {
      style = useFrameAnnotationSettingsPopoverPosition({
        anchorEl: anchor,
        height: 300,
        isOpen: true,
        popoverRef,
        width: 360,
      });
      return null;
    }

    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Harness />));
    expect(style).toMatchObject({
      position: 'fixed',
      pointerEvents: 'auto',
      width: 360,
      zIndex: 2147483647,
      ...expected,
    });
    act(() => root.unmount());
  }
);

function createRect(input: { left: number; top: number; width: number; height: number }): DOMRect {
  return {
    ...input,
    x: input.left,
    y: input.top,
    right: input.left + input.width,
    bottom: input.top + input.height,
    toJSON: () => ({}),
  } as DOMRect;
}

it('enables the shared header drag contract for element-owned editor menus', () => {
  const anchor = document.createElement('button');
  document.body.append(anchor);
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(
    createRect({ left: 100, top: 100, width: 40, height: 30 })
  );
  let presentation: ReturnType<typeof useFrameAnnotationPopoverPresentation> | null = null;
  const popoverRef = { current: null };

  function Harness() {
    presentation = useFrameAnnotationPopoverPresentation({
      anchorEl: anchor,
      context: 'element',
      height: 300,
      isOpen: true,
      popoverRef,
      resetKey: 'frame-1',
      width: 360,
    });
    return null;
  }

  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Harness />));
  expect(presentation).toMatchObject({
    drag: expect.objectContaining({ onPointerDown: expect.any(Function) }),
    style: expect.objectContaining({ pointerEvents: 'auto', zIndex: 2147483647 }),
  });
  act(() => root.unmount());
});
