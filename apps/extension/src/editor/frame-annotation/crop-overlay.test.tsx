// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { EditorCropOverlay } from './crop-overlay';

it('projects the live crop mask and outline above frame annotations without taking pointer input', () => {
  const guide = {
    sniptaleRole: 'crop-guide',
    getBoundingRect: vi.fn(() => ({ left: 20, top: 10, width: 80, height: 40 })),
  };
  let afterRender: (() => void) | undefined;
  const canvas = {
    getObjects: vi.fn(() => [guide]),
    on: vi.fn((_event: string, callback: () => void) => {
      afterRender = callback;
    }),
    off: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  act(() =>
    root.render(
      <EditorCropOverlay
        activeTool="crop"
        canvas={canvas as never}
        documentSize={{ width: 200, height: 100 }}
      />
    )
  );
  const overlay = host.querySelector<SVGSVGElement>('[data-ui="editor.crop-overlay"]');
  expect(overlay?.style.pointerEvents).toBe('none');
  expect(overlay?.querySelector('rect')?.getAttribute('x')).toBe('20');
  expect(overlay?.querySelector('rect')?.getAttribute('width')).toBe('80');

  guide.getBoundingRect.mockReturnValue({ left: 60, top: 15, width: 80, height: 40 });
  act(() => afterRender?.());
  expect(overlay?.querySelector('rect')?.getAttribute('x')).toBe('60');

  act(() =>
    root.render(
      <EditorCropOverlay
        activeTool="select"
        canvas={canvas as never}
        documentSize={{ width: 200, height: 100 }}
      />
    )
  );
  expect(host.querySelector('[data-ui="editor.crop-overlay"]')).toBeNull();
  act(() => root.unmount());
  host.remove();
});
