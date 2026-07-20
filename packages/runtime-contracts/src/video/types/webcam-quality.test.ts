import { expect, it } from 'vitest';
import { WebcamFrameRatePreset, WebcamResolutionPreset } from './types';
import {
  buildWebcamQualityConstraints,
  isWebcamFrameRatePresetSupported,
  isWebcamResolutionPresetSupported,
} from './webcam-quality';

it('builds ideal webcam constraints from selected presets', () => {
  expect(
    buildWebcamQualityConstraints({
      frameRate: WebcamFrameRatePreset.FPS60,
      resolution: WebcamResolutionPreset.P1080,
    })
  ).toEqual({
    frameRate: { ideal: 60 },
    height: { ideal: 1080 },
    width: { ideal: 1920 },
  });

  expect(
    buildWebcamQualityConstraints({
      frameRate: WebcamFrameRatePreset.AUTO,
      resolution: WebcamResolutionPreset.AUTO,
    })
  ).toEqual({});
});

it('filters webcam presets through capability ranges', () => {
  const capabilities = {
    frameRate: { max: 30, min: 15 },
    height: { max: 1080, min: 240 },
    width: { max: 1920, min: 320 },
  } as MediaTrackCapabilities;

  expect(isWebcamResolutionPresetSupported(capabilities, WebcamResolutionPreset.P1080)).toBe(true);
  expect(isWebcamResolutionPresetSupported(capabilities, WebcamResolutionPreset.P4K)).toBe(false);
  expect(isWebcamFrameRatePresetSupported(capabilities, WebcamFrameRatePreset.FPS30)).toBe(true);
  expect(isWebcamFrameRatePresetSupported(capabilities, WebcamFrameRatePreset.FPS60)).toBe(false);
  expect(isWebcamFrameRatePresetSupported({}, WebcamFrameRatePreset.FPS30)).toBe(false);
});
