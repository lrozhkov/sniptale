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
import { mergeVideoProjectExportSettings } from '../../../features/video/project/export/capabilities';
import { ExportDialog } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    resolution: 'SOURCE' as const,
    fps: 30,
    height: 1080,
    mp4VideoCodec: VideoMp4Codec.AVC,
    quality: VideoExportQualityPreset.MEDIUM,
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
        sourceDimensions={{ height: 1080, width: 1920 }}
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

it('renders inside the shared modal shell and wires close, export, select, and toggle actions', async () => {
  const { onChange, onClose, onExport } = renderDialog();

  expect(container?.querySelector('[role="dialog"]')).not.toBeNull();
  expect(container?.textContent).toContain('videoEditor.exportDialog.title');
  expect(container?.textContent).not.toContain('videoEditor.exportDialog.exportSubtitleFiles');
  expect(container?.textContent).not.toContain('videoEditor.exportDialog.burnInSubtitles');

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

  await act(async () => {
    webmOption?.click();
    await Promise.resolve();
  });
  act(() => {
    downloadToggle?.click();
    exportButton?.click();
  });

  expect(onChange).toHaveBeenCalledWith({
    format: VideoExportFormat.WEBM,
    webmVideoCodec: 'VP9',
  });
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
    settings: mergeVideoProjectExportSettings(createSettings(), {
      format: VideoExportFormat.WEBM,
    }),
  });

  const exportButton = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('button') ?? []
  ).find((button) => button.textContent?.includes('videoEditor.exportDialog.submit'));

  expect(container?.textContent).toContain('videoEditor.exportDialog.capabilityLoading');
  expect(container?.textContent).toContain('videoEditor.exportDialog.capabilityFallbackNote');
  expect(exportButton?.disabled).toBe(true);
});

it('restores the default MP4 codec when switching back from WebM during the same dialog session', async () => {
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
      resolution: 'SOURCE' as const,
      webmVideoCodec: 'VP9' as const,
      downloadAfterExport: true,
      fps: 30,
      height: 1080,
      quality: VideoExportQualityPreset.MEDIUM,
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

  await act(async () => {
    mp4Option?.click();
    await Promise.resolve();
  });

  expect(onChange).toHaveBeenCalledWith({
    format: VideoExportFormat.MP4,
    mp4VideoCodec: VideoMp4Codec.HEVC,
  });
});

it('names the dialog, keeps Tab inside it and restores its opener on unmount', () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  renderDialog();
  const dialog = container!.querySelector<HTMLElement>('[role="dialog"]')!;
  const titleId = dialog.getAttribute('aria-labelledby');
  expect(titleId).toBeTruthy();
  expect(document.getElementById(titleId!)?.textContent).toContain(
    'videoEditor.exportDialog.title'
  );
  const buttons = dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
  const first = buttons[0]!;
  const last = buttons[buttons.length - 1]!;
  expect(document.activeElement).toBe(first);
  act(() =>
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    )
  );
  expect(document.activeElement).toBe(last);
  act(() =>
    last.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    )
  );
  expect(document.activeElement).toBe(first);
  act(() => root!.render(null));
  expect(document.activeElement).toBe(opener);
  opener.remove();
});

it('leaves a portaled select for the adjacent form control on Tab in either direction', () => {
  renderDialog();
  const trigger = container!.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.exportDialog.formatLabel"]'
  )!;
  const scope = container!.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.exportDialog.scopeLabel"]'
  )!;
  const resolution = container!.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.exportDialog.resolutionLabel"]'
  )!;
  for (const [shiftKey, expected] of [
    [false, resolution],
    [true, scope],
  ] as const) {
    act(() => trigger.click());
    const option = document.querySelector<HTMLButtonElement>('[role="option"]')!;
    act(() => {
      option.focus();
      option.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })
      );
    });
    expect(document.activeElement).toBe(expected);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  }
});
