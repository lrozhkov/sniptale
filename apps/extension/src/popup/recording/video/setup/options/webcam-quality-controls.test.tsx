// @vitest-environment jsdom

import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  WebcamFrameRatePreset,
  WebcamResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  WebcamQualityOptionGroup,
  formatActualSettings,
  useWebcamFrameRateOptions,
  useWebcamResolutionOptions,
} from './webcam-quality-controls';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => {
    if (key === 'popup.video.webcamQualityActual') {
      return 'Received: {resolution}, {frameRate}';
    }
    if (key === 'popup.video.webcamQualityActualFps') {
      return '{fps} fps';
    }
    return key;
  },
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderNode(node: ReactNode) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(node));
}

function OptionsProbe() {
  const capabilities = {
    frameRate: { max: 30, min: 15 },
    height: { max: 1080, min: 240 },
    width: { max: 1920, min: 320 },
  } as MediaTrackCapabilities;
  const resolutionOptions = useWebcamResolutionOptions(capabilities);
  const frameRateOptions = useWebcamFrameRateOptions(capabilities);

  return (
    <div>
      <WebcamQualityOptionGroup
        activeValue={WebcamResolutionPreset.P720}
        labelKey="popup.video.webcamQualityResolutionLabel"
        onChange={() => undefined}
        options={resolutionOptions}
      />
      <WebcamQualityOptionGroup
        activeValue={WebcamFrameRatePreset.FPS30}
        labelKey="popup.video.webcamQualityFrameRateLabel"
        onChange={() => undefined}
        options={frameRateOptions}
      />
    </div>
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('formats actual webcam settings', () => {
  expect(formatActualSettings({ frameRate: 30, height: 720, width: 1280 })).toContain('1280x720');
  expect(formatActualSettings(null)).toBe('popup.video.webcamQualityActualUnknown');
});

it('renders capability-filtered quality options', () => {
  renderNode(<OptionsProbe />);

  expect(container?.textContent).toContain('popup.video.webcamQualityResolution720p');
  expect(container?.textContent).toContain('popup.video.webcamQualityResolution1080p');
  expect(container?.textContent).not.toContain('popup.video.webcamQualityResolution4k');
  expect(container?.textContent).toContain('popup.video.webcamQualityFrameRate30');
  expect(container?.textContent).not.toContain('popup.video.webcamQualityFrameRate60');
});
