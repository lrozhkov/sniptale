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
      settings: {
        downloadAfterExport: true,
        format: VideoExportFormat.MP4,
        fps: 30,
        height: 1080,
        quality: VideoExportQualityPreset.BALANCED,
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
  expect(markup).toContain('effectPlanIntegrityFailure');
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
