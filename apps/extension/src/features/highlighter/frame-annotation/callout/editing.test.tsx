// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScaledFrameAnnotationCoordinateSpace } from '../coordinate-space';
import { useFrameCalloutEditing } from './editing';
import { useCalloutEditingFocusEffect } from './editing-effects';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('focuses a newly inserted callout without scrolling the image viewport', () => {
  const focus = vi.spyOn(HTMLDivElement.prototype, 'focus');
  let retryFocus: FrameRequestCallback | undefined;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    retryFocus = callback;
    return 1;
  });
  function Harness() {
    const contentEditableRef = React.useRef<HTMLDivElement | null>(null);
    useCalloutEditingFocusEffect({ contentEditableRef, htmlContent: '', isEditing: true });
    return <div ref={contentEditableRef} contentEditable />;
  }

  act(() => root.render(<Harness />));

  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  (host.firstElementChild as HTMLDivElement | null)?.blur();
  retryFocus?.(0);
  expect(focus).toHaveBeenCalledTimes(2);
  expect(focus).toHaveBeenNthCalledWith(2, { preventScroll: true });
});

it('focuses again only when editing resumes and restores existing callout text', () => {
  const focus = vi.spyOn(HTMLDivElement.prototype, 'focus');
  function Harness({ htmlContent, isEditing }: { htmlContent: string; isEditing: boolean }) {
    const contentEditableRef = React.useRef<HTMLDivElement | null>(null);
    useCalloutEditingFocusEffect({ contentEditableRef, htmlContent, isEditing });
    return <div ref={contentEditableRef} contentEditable={isEditing} />;
  }

  act(() => root.render(<Harness htmlContent="<b>Text</b>" isEditing />));
  expect(host.firstElementChild?.innerHTML).toBe('<b>Text</b>');
  expect(focus).toHaveBeenCalledTimes(1);

  act(() => root.render(<Harness htmlContent="<b>Text!</b>" isEditing />));
  expect(focus).toHaveBeenCalledTimes(1);

  act(() => root.render(<Harness htmlContent="<b>Text!</b>" isEditing={false} />));
  act(() => root.render(<Harness htmlContent="<b>Text!</b>" isEditing />));
  expect(focus).toHaveBeenCalledTimes(2);
  expect(focus).toHaveBeenNthCalledWith(2, { preventScroll: true });
});

it('supports an editor coordinate space without requiring a title field', () => {
  let dimensions = { width: -1, height: -1 };
  function Harness() {
    const editing = useFrameCalloutEditing({
      coordinateSpace: createScaledFrameAnnotationCoordinateSpace({
        origin: { x: 100, y: 50 },
        scale: 2,
        viewport: { width: 800, height: 600 },
      }),
      frameId: 'frame-1',
      htmlContent: '',
      isEditing: false,
      onContentChange: vi.fn(),
      onDelete: vi.fn(),
      onStartEditing: vi.fn(),
      onStopEditing: vi.fn(),
      settingsKey: 'settings-1',
    });
    dimensions = editing.layout.dimensions;
    return <div ref={editing.refs.container} />;
  }
  act(() => root.render(<Harness />));
  expect(dimensions).toEqual({ width: 0, height: 0 });
});
