// @vitest-environment jsdom

import { act } from 'react';
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
  type VideoProjectExportSettings,
} from '../../../features/video/project/types';
import { useExportDialogCapabilities } from './capability-state';

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

function HookHarness(props: {
  settings?: VideoProjectExportSettings;
  onChange: (patch: Partial<VideoProjectExportSettings>) => void;
}) {
  const state = useExportDialogCapabilities({
    onChange: props.onChange,
    settings: props.settings ?? createSettings(),
  });

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
  });
});
