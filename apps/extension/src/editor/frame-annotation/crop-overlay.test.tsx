// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { EditorCropOverlay } from './crop-overlay';
import { useEditorStore } from '../state/useEditorStore';

it('projects the live crop mask without an outline', () => {
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
  expect(overlay?.querySelector('rect')).toBeNull();
  expect(overlay?.querySelector('path')?.getAttribute('d')).toContain('M 20 10 h 80 v 40');

  guide.getBoundingRect.mockReturnValue({ left: 60, top: 15, width: 80, height: 40 });
  act(() => afterRender?.());
  expect(overlay?.querySelector('path')?.getAttribute('d')).toContain('M 60 15 h 80 v 40');

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

it('dims the full workspace outside a free canvas selection', () => {
  useEditorStore.getState().setCanvasCropMode('expand');
  const guide = {
    sniptaleRole: 'crop-guide',
    getBoundingRect: () => ({ left: -100, top: -50, width: 300, height: 200 }),
  };
  const canvas = { getObjects: () => [guide], on: vi.fn(), off: vi.fn() };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
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
    expect(overlay?.getAttribute('width')).toBe('4296');
    expect(overlay?.style.left).toBe('-2048px');
    expect(overlay?.querySelector('path')?.getAttribute('d')).toContain('M 1948 1998 h 300 v 200');
  } finally {
    act(() => root.unmount());
    host.remove();
    useEditorStore.getState().setCanvasCropMode('crop');
  }
});
