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

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', () => ({
  ProductConfirmDialog: ({
    onConfirm,
    onCancel,
  }: {
    onConfirm: () => void;
    onCancel: () => void;
  }) => (
    <div data-ui="editor.page.recover-dialog">
      <button onClick={onConfirm}>Confirm</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
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

async function renderLayout(
  hasImage = true,
  openStatus: 'idle' | 'loading' | 'error' | 'missing' = 'idle',
  onRecoverOriginal = vi.fn(async () => undefined)
) {
  await act(async () => {
    root?.render(
      <EditorPageLayout
        afterLayout={<div data-ui="editor.after-layout">after</div>}
        commandPaletteOpen
        hasImage={hasImage}
        openStatus={openStatus}
        onCloseCommandPalette={vi.fn()}
        onRecoverOriginal={onRecoverOriginal}
      />
    );
  });
}

it('shows a blocking loading status and a recoverable error without raw exception text', async () => {
  await renderLayout(false, 'loading');
  expect(
    container?.querySelector('[data-ui="editor.page.open-loading"]')?.getAttribute('role')
  ).toBe('status');
  expect(container?.querySelector('[data-ui="editor.canvas.empty-dropzone"]')).not.toBeNull();

  await renderLayout(false, 'error');
  expect(container?.querySelector('[data-ui="editor.page.open-loading"]')).toBeNull();
  expect(container?.querySelector('[data-ui="editor.page.open-error"]')?.getAttribute('role')).toBe(
    'alert'
  );
  expect(container?.textContent).not.toContain('Invalid frame annotation metadata');
});

it('keeps the canvas mounted behind the start surface while hiding working chrome', async () => {
  await act(async () => {
    root?.render(
      <EditorPageLayout
        commandPaletteOpen={false}
        hasImage={false}
        openStatus="idle"
        onCloseCommandPalette={vi.fn()}
        onRecoverOriginal={vi.fn(async () => undefined)}
        startPage={<div data-ui="start-content">Start</div>}
      />
    );
  });
  expect(container?.querySelector('[data-ui="editor.canvas-wrapper"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="start-content"]')).not.toBeNull();
  expect(
    container
      ?.querySelector('[data-ui="editor.floating-workspace"]')
      ?.parentElement?.getAttribute('aria-hidden')
  ).toBe('true');
});

it('requires confirmation before replacing a missing document with its original', async () => {
  const recover = vi.fn(async () => undefined);
  await renderLayout(false, 'missing', recover);
  const recoveryButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="editor.page.recover-original"]'
  );
  expect(recoveryButton).not.toBeNull();
  expect(recover).not.toHaveBeenCalled();

  await act(async () => recoveryButton?.click());
  expect(container?.querySelector('[data-ui="editor.page.recover-dialog"]')).not.toBeNull();
  expect(recover).not.toHaveBeenCalled();

  await act(async () => {
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="editor.page.recover-dialog"] button:last-child')
      ?.click();
  });
  expect(recover).not.toHaveBeenCalled();
  expect(container?.querySelector('[data-ui="editor.page.recover-dialog"]')).toBeNull();

  await act(async () => recoveryButton?.click());
  await act(async () => {
    container
      ?.querySelector<HTMLButtonElement>(
        '[data-ui="editor.page.recover-dialog"] button:first-child'
      )
      ?.click();
  });
  expect(recover).toHaveBeenCalledTimes(1);
});

it('shows a specific missing-original message without blocking the empty canvas intake', async () => {
  await renderLayout(false, 'missing');
  expect(
    container?.querySelector('[data-ui="editor.page.open-missing"]')?.getAttribute('role')
  ).toBe('alert');
  expect(container?.querySelector('[data-ui="editor.canvas.empty-dropzone"]')).not.toBeNull();
});

it('renders the canonical canvas, floating workspace, command palette, and extension slot', async () => {
  await renderLayout();

  const pageRoot = container?.querySelector('[data-ui="editor.page.root"]');
  expect(pageRoot?.className).toContain('relative h-screen');
  expect(pageRoot?.className).toContain('min-w-[1280px]');
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
