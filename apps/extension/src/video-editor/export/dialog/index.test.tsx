// @vitest-environment jsdom
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import * as sizeEstimator from '../estimate-size';

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
import { ExportSettingsPanel } from './index';

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

function renderDialog(props?: Partial<React.ComponentProps<typeof ExportSettingsPanel>>) {
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
      <ExportSettingsPanel
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

it('renders inline inspector controls and wires close, export, select, and toggle actions', async () => {
  const { onChange, onClose, onExport } = renderDialog();

  expect(container?.querySelector('[role="dialog"]')).toBeNull();
  expect(container?.querySelector('[role="region"]')).not.toBeNull();
  expect(container?.querySelector('[role="region"]')?.getAttribute('aria-label')).toBe(
    'videoEditor.exportDialog.title'
  );
  expect(container?.textContent).not.toContain('videoEditor.exportDialog.exportSubtitleFiles');
  expect(container?.textContent).not.toContain('videoEditor.exportDialog.burnInSubtitles');

  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const closeButton = buttons.find(
    (button) => button.textContent === 'videoEditor.exportDialog.cancel'
  );
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

it('names and focuses the inspector without trapping Tab, and restores its opener on close', () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  const { onClose } = renderDialog();
  const panel = container!.querySelector<HTMLElement>('[role="region"]')!;
  expect(panel.getAttribute('aria-label')).toBe('videoEditor.exportDialog.title');
  expect(document.activeElement).toBe(panel);
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  act(() => panel.dispatchEvent(tab));
  expect(tab.defaultPrevented).toBe(false);
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  act(() => panel.dispatchEvent(escape));
  expect(escape.defaultPrevented).toBe(true);
  expect(onClose).toHaveBeenCalledOnce();
  act(() => root!.render(null));
  expect(document.activeElement).toBe(opener);
  opener.remove();
});

it('does not restore focus over a destination chosen outside the inspector', () => {
  renderDialog();
  const destination = document.createElement('button');
  document.body.append(destination);
  destination.focus();
  act(() => root!.render(null));
  expect(document.activeElement).toBe(destination);
  destination.remove();
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

it('preserves selected HEVC and blocks submission until it is supported', () => {
  const settings = mergeVideoProjectExportSettings(createSettings(), {
    format: VideoExportFormat.MP4,
    mp4VideoCodec: VideoMp4Codec.HEVC,
  });
  useExportDialogCapabilitiesMock.mockReturnValue({
    capabilities: {
      formats: [{ format: VideoExportFormat.MP4, available: true }],
      mp4Codecs: [
        { codec: VideoMp4Codec.AVC, available: true },
        { codec: VideoMp4Codec.HEVC, available: false },
      ],
      defaultMp4VideoCodec: VideoMp4Codec.AVC,
    },
    capabilitiesPending: false,
    capabilityError: null,
  });
  const { onExport, onChange } = renderDialog({ settings });
  const submit = Array.from(container!.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('videoEditor.exportDialog.submit')
  )!;
  expect(submit.disabled).toBe(true);
  act(() => submit.click());
  expect(onExport).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
  expect(container!.textContent).toContain('videoEditor.exportDialog.codecHevcLabel');
  useExportDialogCapabilitiesMock.mockReturnValue({
    capabilities: {
      formats: [{ format: VideoExportFormat.MP4, available: true }],
      mp4Codecs: [{ codec: VideoMp4Codec.HEVC, available: true }],
      defaultMp4VideoCodec: VideoMp4Codec.HEVC,
    },
    capabilitiesPending: false,
    capabilityError: null,
  });
  renderDialog({ settings });
  expect(submit.disabled).toBe(false);
});

it('keeps export enabled while size estimation is pending and cancels the debounced probe on submit', async () => {
  vi.useFakeTimers();
  const calculate = vi
    .spyOn(sizeEstimator, 'estimateProjectExportSize')
    .mockResolvedValue({ bytes: 100, lowerBytes: 75, upperBytes: 135, sampledSeconds: 1 });
  try {
    const { onExport } = renderDialog({
      estimateContext: { project: { ...createEmptyVideoProject(), duration: 5 }, assetUrls: {} },
    });
    expect(container!.textContent).toContain('videoEditor.exportDialog.sizeEstimating');
    const submit = Array.from(container!.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('videoEditor.exportDialog.submit')
    )!;
    expect(submit.disabled).toBe(false);
    act(() => submit.click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(onExport).toHaveBeenCalledOnce();
    expect(calculate).not.toHaveBeenCalled();
  } finally {
    calculate.mockRestore();
    vi.useRealTimers();
  }
});

it.each(['ready', 'pending'])(
  'clears the %s constant-rate size estimate when adaptive is selected',
  async (phase) => {
    vi.useFakeTimers();
    let resolve!: (value: {
      bytes: number;
      lowerBytes: number;
      upperBytes: number;
      sampledSeconds: number;
    }) => void;
    const calculate = vi.spyOn(sizeEstimator, 'estimateProjectExportSize').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const estimateContext = {
      project: { ...createEmptyVideoProject(), duration: 5 },
      assetUrls: {},
    };
    try {
      renderDialog({ estimateContext });
      await act(async () => vi.advanceTimersByTimeAsync(1000));
      const signal = calculate.mock.calls[0]![0].signal;
      if (phase === 'ready')
        await act(async () =>
          resolve({ bytes: 100, lowerBytes: 75, upperBytes: 135, sampledSeconds: 1 })
        );
      renderDialog({
        estimateContext,
        settings: { ...createSettings(), fps: 60, frameRateMode: 'adaptive' },
      });
      expect(container!.querySelector('[data-ui="video.exportSizeEstimate"]')).toBeNull();
      if (phase === 'pending') {
        expect(signal.aborted).toBe(true);
        await act(async () =>
          resolve({ bytes: 100, lowerBytes: 75, upperBytes: 135, sampledSeconds: 1 })
        );
      }
      await act(async () => vi.advanceTimersByTimeAsync(2000));
      expect(calculate).toHaveBeenCalledOnce();
    } finally {
      calculate.mockRestore();
      vi.useRealTimers();
    }
  }
);
