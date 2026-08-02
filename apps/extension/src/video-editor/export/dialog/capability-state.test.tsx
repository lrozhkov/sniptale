// @vitest-environment jsdom

import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { getProjectExportCapabilitiesMock } = vi.hoisted(() => ({
  getProjectExportCapabilitiesMock: vi.fn(),
}));

vi.mock('../../project/operations/ops', () => ({
  getProjectExportCapabilities: getProjectExportCapabilitiesMock,
}));
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoMp4Codec,
  VideoWebmCodec,
  type VideoProjectExportSettings,
  type VideoProjectExportSettingsPatch,
} from '../../../features/video/project/types';
import { useExportDialogCapabilities } from './capability-state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createSettings(): Extract<VideoProjectExportSettings, { format: 'MP4' }> {
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

function createCapabilities(defaultMp4VideoCodec: VideoMp4Codec) {
  return {
    success: true,
    capabilities: {
      formats: [
        { format: VideoExportFormat.MP4, available: true },
        { format: VideoExportFormat.WEBM, available: true },
      ],
      mp4Codecs: [
        { codec: VideoMp4Codec.AVC, available: defaultMp4VideoCodec === VideoMp4Codec.AVC },
        { codec: VideoMp4Codec.HEVC, available: defaultMp4VideoCodec === VideoMp4Codec.HEVC },
      ],
      defaultMp4VideoCodec,
    },
  };
}

function HookHarness(props: {
  onLayoutEffect?: () => void;
  settings?: VideoProjectExportSettings;
  onChange: (patch: VideoProjectExportSettingsPatch) => void;
}) {
  const { onChange, onLayoutEffect, settings } = props;
  const state = useExportDialogCapabilities({
    onChange,
    settings: settings ?? createSettings(),
  });
  useLayoutEffect(() => {
    onLayoutEffect?.();
  }, [onLayoutEffect]);

  return <pre>{JSON.stringify(state)}</pre>;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('stores successful export capabilities and normalizes unavailable codecs', async () => {
  const onChange = vi.fn();
  getProjectExportCapabilitiesMock.mockResolvedValue({
    success: true,
    capabilities: {
      formats: [
        { format: VideoExportFormat.MP4, available: true },
        { format: VideoExportFormat.WEBM, available: true },
      ],
      mp4Codecs: [
        { codec: VideoMp4Codec.AVC, available: false, reason: 'CODEC_UNSUPPORTED' },
        { codec: VideoMp4Codec.HEVC, available: true },
      ],
      defaultMp4VideoCodec: VideoMp4Codec.HEVC,
    },
  });

  act(() => {
    root?.render(<HookHarness onChange={onChange} />);
  });
  await flushEffects();

  expect(getProjectExportCapabilitiesMock).toHaveBeenCalledWith(createSettings());
  expect(container?.textContent).toContain('"capabilitiesPending":false');
  expect(container?.textContent).toContain('"defaultMp4VideoCodec":"HEVC"');
  expect(onChange).toHaveBeenCalledWith({ mp4VideoCodec: VideoMp4Codec.HEVC });
});

it('falls back to WebM-only capabilities when probing fails', async () => {
  const onChange = vi.fn();
  getProjectExportCapabilitiesMock.mockRejectedValue(new Error('probe failed'));

  act(() => {
    root?.render(<HookHarness onChange={onChange} />);
  });
  await flushEffects();

  expect(container?.textContent).toContain('"capabilityError":"probe failed"');
  expect(container?.textContent).toContain('"format":"WEBM"');
  expect(onChange).toHaveBeenCalledWith({
    format: VideoExportFormat.WEBM,
    mp4VideoCodec: undefined,
    webmVideoCodec: VideoWebmCodec.VP9,
  });
});

it('re-probes exact encoder inputs and ignores an older result with a stable change owner', async () => {
  let resolveInitial: ((value: ReturnType<typeof createCapabilities>) => void) | undefined;
  let resolveUpdated: ((value: ReturnType<typeof createCapabilities>) => void) | undefined;
  getProjectExportCapabilitiesMock
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInitial = resolve;
        })
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpdated = resolve;
        })
    );
  const onChange = vi.fn();
  const initialSettings = createSettings();
  const updatedSettings: VideoProjectExportSettings = {
    ...initialSettings,
    fps: 60,
    height: 1440,
    quality: VideoExportQualityPreset.HIGH,
    resolution: '1440P',
    width: 2560,
  };

  act(() => {
    root?.render(<HookHarness onChange={onChange} settings={initialSettings} />);
  });
  await flushEffects();
  act(() => {
    root?.render(<HookHarness onChange={onChange} settings={updatedSettings} />);
  });
  await flushEffects();

  expect(getProjectExportCapabilitiesMock).toHaveBeenNthCalledWith(1, initialSettings);
  expect(getProjectExportCapabilitiesMock).toHaveBeenNthCalledWith(2, updatedSettings);

  await act(async () => {
    resolveUpdated?.(createCapabilities(VideoMp4Codec.HEVC));
    await Promise.resolve();
  });
  expect(container?.textContent).toContain('"defaultMp4VideoCodec":"HEVC"');

  await act(async () => {
    resolveInitial?.(createCapabilities(VideoMp4Codec.AVC));
    await Promise.resolve();
  });
  expect(container?.textContent).toContain('"defaultMp4VideoCodec":"HEVC"');
  expect(container?.textContent).not.toContain('"defaultMp4VideoCodec":"AVC"');
});

it('normalizes an in-flight response against the latest same-fingerprint format and codec', async () => {
  let resolveCapabilities: ((value: ReturnType<typeof createCapabilities>) => void) | undefined;
  getProjectExportCapabilitiesMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveCapabilities = resolve;
      })
  );
  const onChange = vi.fn();
  const { mp4VideoCodec: _mp4VideoCodec, ...initialBase } = createSettings();
  const initialSettings: VideoProjectExportSettings = {
    ...initialBase,
    format: VideoExportFormat.WEBM,
    webmVideoCodec: VideoWebmCodec.VP8,
  };
  const updatedSettings: VideoProjectExportSettings = {
    ...createSettings(),
    mp4VideoCodec: VideoMp4Codec.HEVC,
  };

  act(() => {
    root?.render(<HookHarness onChange={onChange} settings={initialSettings} />);
  });
  await flushEffects();
  act(() => {
    root?.render(<HookHarness onChange={onChange} settings={updatedSettings} />);
  });
  await flushEffects();

  expect(getProjectExportCapabilitiesMock).toHaveBeenCalledTimes(1);
  expect(getProjectExportCapabilitiesMock).toHaveBeenCalledWith(initialSettings);

  await act(async () => {
    resolveCapabilities?.(createCapabilities(VideoMp4Codec.AVC));
    await Promise.resolve();
  });

  expect(onChange).toHaveBeenCalledWith({ mp4VideoCodec: VideoMp4Codec.AVC });
  expect(container?.textContent).toContain('"defaultMp4VideoCodec":"AVC"');
});

it('rejects an old fingerprint response that resolves before passive cleanup', async () => {
  let resolveInitial: (() => void) | undefined;
  getProjectExportCapabilitiesMock
    .mockImplementationOnce(() => ({
      then: (onFulfilled: (value: ReturnType<typeof createCapabilities>) => void) => {
        resolveInitial = () => onFulfilled(createCapabilities(VideoMp4Codec.AVC));
        return { catch: () => undefined };
      },
    }))
    .mockImplementationOnce(() => new Promise(() => undefined));
  const onChange = vi.fn();
  const initialSettings = createSettings();
  const updatedSettings: VideoProjectExportSettings = {
    ...initialSettings,
    height: 1440,
    mp4VideoCodec: VideoMp4Codec.HEVC,
    resolution: '1440P',
    width: 2560,
  };

  act(() => {
    root?.render(<HookHarness onChange={onChange} settings={initialSettings} />);
  });
  await flushEffects();

  act(() => {
    root?.render(
      <HookHarness
        onChange={onChange}
        onLayoutEffect={() => resolveInitial?.()}
        settings={updatedSettings}
      />
    );
  });
  await flushEffects();

  expect(getProjectExportCapabilitiesMock).toHaveBeenNthCalledWith(1, initialSettings);
  expect(getProjectExportCapabilitiesMock).toHaveBeenNthCalledWith(2, updatedSettings);
  expect(onChange).not.toHaveBeenCalled();
  expect(container?.textContent).toContain('"capabilitiesPending":true');
});
