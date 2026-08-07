// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScaledFrameAnnotationCoordinateSpace } from '../coordinate-space';
import { useFrameCalloutEditing } from './editing';

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
  vi.unstubAllGlobals();
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
