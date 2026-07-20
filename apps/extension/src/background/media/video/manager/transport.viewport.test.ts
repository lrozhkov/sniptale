import { expect, it, vi } from 'vitest';
import {
  CaptureMode,
  type VideoViewportPresetSelection,
} from '@sniptale/runtime-contracts/video/types/types';
import { buildViewportEmulationResult } from './transport.viewport';

function createViewportPreset(): VideoViewportPresetSelection {
  return {
    height: 720,
    id: 'wide',
    label: 'Wide',
    width: 1280,
  };
}

it('reports viewport emulation setup failures through the start-failure policy', async () => {
  const configureViewport = vi.fn(async () => {
    throw new Error('viewport failed');
  });
  const notifyStartFailed = vi.fn();
  const abortStart = vi.fn(() => false);

  await expect(
    buildViewportEmulationResult(5, CaptureMode.VIEWPORT_EMULATION, createViewportPreset(), {
      abortStart,
      cleanupViewportEmulation: vi.fn(),
      configureViewportEmulation: configureViewport,
      notifyStartFailed,
    })
  ).resolves.toBeNull();

  expect(configureViewport).toHaveBeenCalledOnce();
  expect(notifyStartFailed).toHaveBeenCalledWith('viewport failed');
  expect(abortStart).not.toHaveBeenCalled();
});

it('skips viewport emulation when the mode or preset does not require it', async () => {
  const configureViewport = vi.fn();
  const notifyStartFailed = vi.fn();
  const abortStart = vi.fn();

  await expect(
    buildViewportEmulationResult(5, CaptureMode.TAB, createViewportPreset(), {
      abortStart,
      cleanupViewportEmulation: vi.fn(),
      configureViewportEmulation: configureViewport,
      notifyStartFailed,
    })
  ).resolves.toBeUndefined();
  await expect(
    buildViewportEmulationResult(5, CaptureMode.VIEWPORT_EMULATION, undefined, {
      abortStart,
      cleanupViewportEmulation: vi.fn(),
      configureViewportEmulation: configureViewport,
      notifyStartFailed,
    })
  ).resolves.toBeUndefined();

  expect(configureViewport).not.toHaveBeenCalled();
  expect(abortStart).not.toHaveBeenCalled();
});

it('returns viewport emulation data when setup succeeds and no cancellation fires', async () => {
  const configureViewport = vi.fn(async () => ({
    cssHeight: 720,
    cssWidth: 1280,
    scale: 1,
  }));
  const notifyStartFailed = vi.fn();
  const abortStart = vi.fn(() => false);

  await expect(
    buildViewportEmulationResult(5, CaptureMode.VIEWPORT_EMULATION, createViewportPreset(), {
      abortStart,
      cleanupViewportEmulation: vi.fn(),
      configureViewportEmulation: configureViewport,
      notifyStartFailed,
    })
  ).resolves.toEqual({
    cssHeight: 720,
    cssWidth: 1280,
    scale: 1,
  });

  expect(abortStart).toHaveBeenCalledWith(
    5,
    CaptureMode.VIEWPORT_EMULATION,
    'viewport emulation setup'
  );
  expect(notifyStartFailed).not.toHaveBeenCalled();
});

it('cleans up viewport emulation when cancellation fires after setup succeeds', async () => {
  const configureViewport = vi.fn(async () => ({
    cssHeight: 720,
    cssWidth: 1280,
    scale: 1,
  }));
  const cleanupViewportEmulation = vi.fn().mockResolvedValue(undefined);
  const notifyStartFailed = vi.fn();
  const abortStart = vi.fn(() => true);

  await expect(
    buildViewportEmulationResult(5, CaptureMode.VIEWPORT_EMULATION, createViewportPreset(), {
      abortStart,
      cleanupViewportEmulation,
      configureViewportEmulation: configureViewport,
      notifyStartFailed,
    })
  ).resolves.toBeNull();

  expect(cleanupViewportEmulation).toHaveBeenCalledWith(5, 'viewport emulation setup cancelled');
  expect(notifyStartFailed).not.toHaveBeenCalled();
});
