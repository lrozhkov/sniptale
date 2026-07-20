// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { useExportDialogCapabilitiesMock } = vi.hoisted(() => ({
  useExportDialogCapabilitiesMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('./capability-state', () => ({
  useExportDialogCapabilities: useExportDialogCapabilitiesMock,
}));
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoMp4Codec,
  type VideoProjectExportSettings,
} from '../../../features/video/project/types';
import { ExportDialog } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 1080,
    mp4VideoCodec: VideoMp4Codec.AVC,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1920,
  };
}

function renderDialog(props?: Partial<React.ComponentProps<typeof ExportDialog>>) {
  const onClose = vi.fn();
  const onChange = vi.fn();
  const onExport = vi.fn();

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <ExportDialog
        settings={createSettings()}
        onClose={onClose}
        onChange={onChange}
        onExport={onExport}
        {...props}
      />
    );
  });

  return { onChange, onClose, onExport };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useExportDialogCapabilitiesMock.mockReturnValue({
    capabilities: {
      formats: [
        { format: VideoExportFormat.MP4, available: true },
        { format: VideoExportFormat.WEBM, available: true },
      ],
      mp4Codecs: [{ codec: VideoMp4Codec.AVC, available: true }],
      defaultMp4VideoCodec: VideoMp4Codec.AVC,
    },
    capabilitiesPending: false,
    capabilityError: null,
  });
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

it('renders inside the shared modal shell and wires close, export, select, and toggle actions', () => {
  const { onChange, onClose, onExport } = renderDialog();

  expect(container?.querySelector('[role="dialog"]')).not.toBeNull();
  expect(container?.textContent).toContain('videoEditor.exportDialog.titlePrefix');

  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const closeButton = container?.querySelector<HTMLButtonElement>('.sniptale-modal-close');
  const formatTrigger = container?.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.exportDialog.formatLabel"]'
  );
  const downloadToggle = buttons.find((button) =>
    button.textContent?.includes('videoEditor.exportDialog.downloadAfterExport')
  );
  const exportButton = buttons.find((button) =>
    button.textContent?.includes('videoEditor.exportDialog.submit')
  );

  act(() => {
    closeButton?.click();
  });
  expect(onClose).toHaveBeenCalledTimes(1);

  act(() => {
    formatTrigger?.click();
  });

  const webmOption = Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []
  ).find((button) => button.textContent?.includes('videoEditor.exportDialog.formatWebmLabel'));

  act(() => {
    webmOption?.click();
    downloadToggle?.click();
    exportButton?.click();
  });

  expect(onChange).toHaveBeenCalledWith({ format: VideoExportFormat.WEBM });
  expect(onChange).toHaveBeenCalledWith({ downloadAfterExport: false });
  expect(onExport).toHaveBeenCalledTimes(1);
});

it('renders export setting dropdowns on the stable floating layer', () => {
  renderDialog();

  const formatTrigger = container?.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.exportDialog.formatLabel"]'
  );

  act(() => {
    formatTrigger?.click();
  });

  const listbox = document.body.querySelector<HTMLElement>('[role="listbox"]');

  expect(listbox?.className).toContain('z-[2147483647]');
});

it('disables export while capability probing is pending and renders WebM-only hint copy', () => {
  useExportDialogCapabilitiesMock.mockReturnValueOnce({
    capabilities: {
      formats: [{ format: VideoExportFormat.WEBM, available: true }],
      mp4Codecs: [],
      defaultMp4VideoCodec: null,
    },
    capabilitiesPending: true,
    capabilityError: 'probe failed',
  });

  renderDialog({
    settings: {
      ...createSettings(),
      format: VideoExportFormat.WEBM,
    },
  });

  const exportButton = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('button') ?? []
  ).find((button) => button.textContent?.includes('videoEditor.exportDialog.submit'));

  expect(container?.textContent).toContain('videoEditor.exportDialog.capabilityLoading');
  expect(container?.textContent).toContain('videoEditor.exportDialog.capabilityFallbackNote');
  expect(exportButton?.disabled).toBe(true);
});

it('restores the default MP4 codec when switching back from WebM during the same dialog session', () => {
  useExportDialogCapabilitiesMock.mockReturnValueOnce({
    capabilities: {
      formats: [
        { format: VideoExportFormat.MP4, available: true },
        { format: VideoExportFormat.WEBM, available: true },
      ],
      mp4Codecs: [{ codec: VideoMp4Codec.HEVC, available: true }],
      defaultMp4VideoCodec: VideoMp4Codec.HEVC,
    },
    capabilitiesPending: false,
    capabilityError: null,
  });

  const { onChange } = renderDialog({
    settings: {
      format: VideoExportFormat.WEBM,
      downloadAfterExport: true,
      fps: 30,
      height: 1080,
      quality: VideoExportQualityPreset.BALANCED,
      width: 1920,
    },
  });

  const formatTrigger = container?.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.exportDialog.formatLabel"]'
  );

  act(() => {
    formatTrigger?.click();
  });

  const mp4Option = Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []
  ).find((button) => button.textContent?.includes('videoEditor.exportDialog.formatMp4Label'));

  act(() => {
    mp4Option?.click();
  });

  expect(onChange).toHaveBeenCalledWith({
    format: VideoExportFormat.MP4,
    mp4VideoCodec: VideoMp4Codec.HEVC,
  });
});
