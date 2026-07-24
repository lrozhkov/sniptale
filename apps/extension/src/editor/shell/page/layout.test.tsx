// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../command-palette', () => ({
  EditorCommandPalette: ({ hasImage, isOpen }: { hasImage: boolean; isOpen: boolean }) => (
    <div data-ui="editor.command-palette">{`${String(hasImage)}:${String(isOpen)}`}</div>
  ),
}));

vi.mock('../../workspace/canvas', () => ({
  CanvasWrapper: ({ hasImage }: { hasImage: boolean }) => (
    <div data-ui="editor.canvas-wrapper">
      <div data-ui="editor.canvas.context-zone">
        <div data-ui="editor.canvas.surface-hit-area">{String(hasImage)}</div>
        {!hasImage ? <div data-ui="editor.canvas.empty-dropzone">empty</div> : null}
      </div>
      <div data-ui="editor.canvas.preview-zone">preview</div>
    </div>
  ),
}));

vi.mock('../../workspace/floating', () => ({
  EditorFloatingWorkspace: ({ hasImage }: { hasImage: boolean }) => (
    <div data-ui="editor.floating-workspace">{String(hasImage)}</div>
  ),
}));

import { EditorPageLayout } from './layout';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

async function renderLayout(hasImage = true) {
  await act(async () => {
    root?.render(
      <EditorPageLayout
        afterLayout={<div data-ui="editor.after-layout">after</div>}
        commandPaletteOpen
        hasImage={hasImage}
        onCloseCommandPalette={vi.fn()}
      />
    );
  });
}

it('renders the canonical canvas, floating workspace, command palette, and extension slot', async () => {
  await renderLayout();

  const pageRoot = container?.querySelector('[data-ui="editor.page.root"]');
  expect(pageRoot?.className).toContain('relative h-screen');
  expect(pageRoot?.className).toContain('bg-[var(--sniptale-color-surface-canvas)]');
  expect(container?.querySelector('[data-ui="editor.canvas.layer"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="editor.floating-workspace"]')?.textContent).toBe(
    'true'
  );
  expect(container?.querySelector('[data-ui="editor.command-palette"]')?.textContent).toBe(
    'true:true'
  );
  expect(container?.querySelector('[data-ui="editor.after-layout"]')?.textContent).toBe('after');
});

it('blocks context menus outside the canonical canvas surface', async () => {
  await renderLayout(false);

  const pageRoot = container?.querySelector<HTMLElement>('[data-ui="editor.page.root"]');
  const canvasZone = container?.querySelector<HTMLElement>(
    '[data-ui="editor.canvas.context-zone"]'
  );
  const canvasSurface = container?.querySelector<HTMLElement>(
    '[data-ui="editor.canvas.surface-hit-area"]'
  );
  const previewZone = container?.querySelector<HTMLElement>(
    '[data-ui="editor.canvas.preview-zone"]'
  );
  const emptyDropzone = container?.querySelector<HTMLElement>(
    '[data-ui="editor.canvas.empty-dropzone"]'
  );

  const createContextMenuEvent = () =>
    new MouseEvent('contextmenu', { bubbles: true, button: 2, cancelable: true });
  const previewEvent = createContextMenuEvent();
  const pageRootEvent = createContextMenuEvent();
  const canvasZoneEvent = createContextMenuEvent();
  const canvasSurfaceEvent = createContextMenuEvent();
  const emptyDropzoneEvent = createContextMenuEvent();

  previewZone?.dispatchEvent(previewEvent);
  pageRoot?.dispatchEvent(pageRootEvent);
  canvasZone?.dispatchEvent(canvasZoneEvent);
  canvasSurface?.dispatchEvent(canvasSurfaceEvent);
  emptyDropzone?.dispatchEvent(emptyDropzoneEvent);

  expect(previewEvent.defaultPrevented).toBe(true);
  expect(pageRootEvent.defaultPrevented).toBe(true);
  expect(canvasZoneEvent.defaultPrevented).toBe(true);
  expect(canvasSurfaceEvent.defaultPrevented).toBe(false);
  expect(emptyDropzoneEvent.defaultPrevented).toBe(false);
});
