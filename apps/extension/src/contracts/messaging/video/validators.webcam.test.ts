import { expect, it } from 'vitest';
import {
  WebcamFrameRatePreset,
  WebcamResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import { isWebcamActualSettings, isWebcamQualitySettings } from './validators.webcam.ts';

it('validates persisted webcam quality settings', () => {
  expect(
    isWebcamQualitySettings({
      frameRate: WebcamFrameRatePreset.FPS30,
      resolution: WebcamResolutionPreset.P720,
    })
  ).toBe(true);
  expect(
    isWebcamQualitySettings({ frameRate: '120', resolution: WebcamResolutionPreset.P720 })
  ).toBe(false);
  expect(isWebcamQualitySettings({ frameRate: WebcamFrameRatePreset.FPS30 })).toBe(false);
});

it('validates numeric webcam actual settings from offscreen', () => {
  expect(isWebcamActualSettings({ frameRate: 30, height: 720, width: 1280 })).toBe(true);
  expect(isWebcamActualSettings({ frameRate: '30', height: 720, width: 1280 })).toBe(false);
  expect(isWebcamActualSettings({})).toBe(true);
});
