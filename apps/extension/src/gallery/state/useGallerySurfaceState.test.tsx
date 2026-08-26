// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGallerySurfaceState } from './useGallerySurfaceState';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestValue: ReturnType<typeof useGallerySurfaceState> | null = null;

function HookProbe() {
  latestValue = useGallerySurfaceState();
  return null;
}

function renderHook() {
  act(() => {
    root?.render(<HookProbe />);
  });

  if (!latestValue) {
    throw new Error('Expected gallery surface state');
  }

  return latestValue;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState({}, '', '/gallery');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  latestValue = null;
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

it('starts with closed app-shell surface state by default', () => {
  const value = renderHook();

  expect(value.state.pendingImport).toBeNull();
  expect(value.state.pendingMediaImport).toBeNull();
  expect(value.state.confirmDialog).toBeNull();
  expect(value.state.banner).toBeNull();
  expect(value.state.isBusy).toBe(false);
});

it('updates app-shell surface state without URL-driven modal state', () => {
  const value = renderHook();

  act(() => {
    value.actions.setBanner('warning');
    value.actions.setIsBusy(true);
    value.actions.setPendingImport({
      file: new File(['backup'], 'backup.zip', { type: 'application/zip' }),
      summary: {
        archiveFingerprint: 'a'.repeat(64),
        assetCount: 1,
        conflicts: [],
        manifest: {
          assetCount: 1,
          effectBundleCount: 0,
          exportedAt: '2026-03-31T00:00:00.000Z',
          format: 'sniptale-backup',
          thumbnailCount: 0,
          version: 1,
        },
        rootCount: 1,
        thumbnailCount: 0,
        totalBytes: 512,
      },
    });
    value.actions.setPendingMediaImport({
      conflicts: [{ filename: 'capture.png', size: 5 }],
      files: [new File(['image'], 'capture.png', { type: 'image/png' })],
    });
    value.actions.setConfirmDialog({
      cancelText: 'Cancel',
      confirmText: 'Delete',
      message: 'Confirm',
      onConfirm: async () => undefined,
      title: 'Delete item',
    });
  });

  const next = latestValue;
  expect(next?.state.banner).toBe('warning');
  expect(next?.state.isBusy).toBe(true);
  expect(next?.state.pendingImport?.file.name).toBe('backup.zip');
  expect(next?.state.pendingMediaImport?.conflicts).toHaveLength(1);
  expect(next?.state.confirmDialog?.title).toBe('Delete item');
});
