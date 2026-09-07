// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoProjectExportPhase,
} from '../../../features/video/project/types';
import { VideoEditorWorkspaceOverlays } from './overlays';

const confirmSpy = vi.fn();
const exportDialogSpy = vi.fn();
const exportProgressSpy = vi.fn();

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/confirm-dialog')>()),
  ProductConfirmDialog: (props: unknown) => {
    confirmSpy(props);
    return <div data-testid="confirm-dialog" />;
  },
}));

vi.mock('../../export/dialog', () => ({
  ExportDialog: (props: unknown) => {
    exportDialogSpy(props);
    return <div data-testid="export-dialog" />;
  },
}));

vi.mock('../../export/progress-overlay', () => ({
  ExportProgressOverlay: (props: unknown) => {
    exportProgressSpy(props);
    return <div data-testid="export-progress" />;
  },
}));

function createOverlaysController() {
  return {
    confirmDialog: {
      title: 'Discard changes?',
      message: 'Body',
      confirmText: 'Discard',
      cancelText: 'Keep',
    },
    onConfirmDialogCancel: vi.fn(),
    onConfirmDialogConfirm: vi.fn(),
    exportDialog: {
      isOpen: true,
      onChange: vi.fn(),
      onClose: vi.fn(),
      onExport: vi.fn(),
      sourceDimensions: { height: 1080, width: 1920 },
      settings: {
        downloadAfterExport: true,
        format: VideoExportFormat.MP4,
        resolution: 'SOURCE' as const,
        mp4VideoCodec: 'AVC' as const,
        fps: 30,
        height: 1080,
        quality: VideoExportQualityPreset.MEDIUM,
        width: 1920,
      },
    },
    exportProgress: {
      isRunning: true,
      onCancel: vi.fn(),
      status: {
        message: 'Muxing project output',
        phase: VideoProjectExportPhase.TRANSCODING,
        progress: 0.6,
      },
    },
    exportFailure: {
      error: 'effectPlanIntegrityFailure',
      onClose: vi.fn(),
      onRetry: vi.fn(),
    },
  };
}

function verifyOverlaySlices() {
  const markup = renderToStaticMarkup(
    <VideoEditorWorkspaceOverlays controller={createOverlaysController()} />
  );

  expect(confirmSpy.mock.calls[0]?.[0]).toMatchObject({
    isOpen: true,
    title: 'Discard changes?',
  });
  expect(exportDialogSpy).toHaveBeenCalledTimes(1);
  expect(exportProgressSpy.mock.calls[0]?.[0]).toMatchObject({
    status: expect.objectContaining({
      phase: VideoProjectExportPhase.TRANSCODING,
    }),
  });
  expect(markup).not.toContain('effectPlanIntegrityFailure');
}

describe('VideoEditorWorkspaceOverlays', () => {
  afterEach(() => {
    confirmSpy.mockReset();
    exportDialogSpy.mockReset();
    exportProgressSpy.mockReset();
  });

  it(
    'renders confirm, export dialog, and export progress from explicit overlay slices',
    verifyOverlaySlices
  );
});

it('contains failure focus, closes with Escape and restores the opener', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  const opener = document.createElement('button');
  document.body.append(opener, container);
  opener.focus();
  const root = createRoot(container);
  const controller = createOverlaysController();
  controller.exportProgress.isRunning = false;
  try {
    act(() => root.render(<VideoEditorWorkspaceOverlays controller={controller} />));
    const dialog = container.querySelector<HTMLElement>('[role="alertdialog"]');
    const buttons = [...(dialog?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(buttons[0]);
    expect(buttons[0]?.title).not.toBe('');
    buttons[0]?.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    expect(document.activeElement).toBe(buttons.at(-1));
    buttons.at(-1)?.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      })
    );
    expect(document.activeElement).toBe(buttons[0]);
    act(() =>
      buttons[0]?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        })
      )
    );
    expect(controller.exportFailure.onClose).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    expect(document.activeElement).toBe(opener);
    container.remove();
    opener.remove();
    vi.unstubAllGlobals();
  }
});

it('keeps cancellation failure in the running progress instead of opening a second modal', () => {
  const markup = renderToStaticMarkup(
    <VideoEditorWorkspaceOverlays controller={createOverlaysController()} />
  );
  expect(markup).not.toContain('role="alertdialog"');
  expect(exportProgressSpy.mock.calls.at(-1)?.[0]).toMatchObject({ cancellationFailed: true });
});
