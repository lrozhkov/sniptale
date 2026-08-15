import { describe, expect, it } from 'vitest';
import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import {
  isSameTabOutputGeometry,
  remapTabOutputGeometry,
  remapTabOutputGeometryFromObservedViewport,
  resolveTabOutputGeometry,
  revalidateTabOutputGeometry,
} from './tab-source';

function resolveFullTab(resolution: VideoResolutionPreset = VideoResolutionPreset.SOURCE) {
  return resolveTabOutputGeometry(
    { x: 0, y: 0, width: 1904, height: 985 },
    { width: 2560, height: 1440 },
    { width: 1904, height: 985, devicePixelRatio: 1 },
    { frameRateCap: 30, resolution, tracksFullViewport: true }
  );
}

describe('tab recording geometry', () => {
  it('uses the logical viewport for SOURCE and the physical track only for sampling', () => {
    const geometry = resolveFullTab();
    expect(geometry).toMatchObject({
      fillsOutput: true,
      fit: 'contain',
      outputBasis: { width: 1904, height: 985 },
      outputSize: { width: 1904, height: 984 },
      sourceRect: {
        x: 1,
        y: expect.closeTo(59.00420168067228),
        width: 2558,
        height: expect.closeTo(1321.9915966386554),
      },
      sourceSize: { width: 2560, height: 1440 },
    });
    expect(geometry.sourceRect.width / geometry.sourceRect.height).toBeCloseTo(
      geometry.outputSize.width / geometry.outputSize.height,
      12
    );
    expect(geometry.sourceRect.y - 58).toBeLessThanOrEqual(1.1);
    expect(1382 - (geometry.sourceRect.y + geometry.sourceRect.height)).toBeLessThanOrEqual(1.1);
  });

  it('removes one physical sampling edge after density-scaled odd-edge normalization', () => {
    const geometry = resolveTabOutputGeometry(
      { x: 0, y: 0, width: 1904, height: 985 },
      { width: 3808, height: 1970 },
      { width: 1904, height: 985, devicePixelRatio: 2 },
      {
        frameRateCap: 30,
        resolution: VideoResolutionPreset.SOURCE,
        tracksFullViewport: true,
      }
    );

    expect(geometry.outputSize).toEqual({ width: 1904, height: 984 });
    expect(geometry.fillsOutput).toBe(true);
    expect(geometry.sourceRect).toEqual({
      x: 1,
      y: expect.closeTo(1.5168067226891253),
      width: 3806,
      height: expect.closeTo(1966.9663865546217),
    });
  });

  it.each([
    [VideoResolutionPreset.P480, { width: 928, height: 480 }],
    [VideoResolutionPreset.P1440, { width: 2784, height: 1440 }],
  ])('uses preset height and logical viewport aspect for %s', (resolution, outputSize) => {
    const geometry = resolveFullTab(resolution);
    expect(geometry.outputSize).toEqual(outputSize);
    expect(geometry.fillsOutput).toBe(false);
  });

  it('uses the logical TAB_CROP selection as output basis', () => {
    const geometry = resolveTabOutputGeometry(
      { x: 100, y: 80, width: 300, height: 301 },
      { width: 2560, height: 1440 },
      { width: 1280, height: 720, devicePixelRatio: 2 },
      { frameRateCap: 24, resolution: VideoResolutionPreset.SOURCE }
    );

    expect(geometry).toMatchObject({
      fillsOutput: false,
      outputBasis: { width: 300, height: 301 },
      outputSize: { width: 300, height: 300 },
      sourceRect: { x: 200, y: 160, width: 600, height: 602 },
    });
  });

  it('remaps a resized full TAB into the immutable encoder canvas', () => {
    const initial = resolveFullTab();
    const outcome = remapTabOutputGeometry(
      initial,
      { width: 2560, height: 1440 },
      { width: 1600, height: 900, devicePixelRatio: 1 }
    );
    const resized = outcome.geometry;

    expect(outcome.kind).toBe('mapped');
    expect(resized).toMatchObject({
      fillsOutput: false,
      fit: 'contain',
      outputBasis: { width: 1904, height: 985 },
      outputSize: { width: 1904, height: 984 },
      requestedCrop: { x: 0, y: 0, width: 1600, height: 900 },
      sourceRect: { x: 0, y: 0, width: 2560, height: 1440 },
    });
    expect(resized.outputBasis).toBe(initial.outputBasis);
    expect(resized.outputSize).toBe(initial.outputSize);
  });

  it('maps full TAB output to the frame-observed viewport instead of the raw tab bounds', () => {
    const initial = resolveFullTab();
    const remapped = remapTabOutputGeometryFromObservedViewport(
      initial,
      { width: 2560, height: 1440 },
      { x: 128, y: 72, width: 2304, height: 1296 },
      { width: 1600, height: 900, devicePixelRatio: 1 }
    );

    expect(remapped).toMatchObject({
      logicalContentRect: { x: 128, y: 72, width: 2304, height: 1296 },
      outputBasis: initial.outputBasis,
      outputSize: initial.outputSize,
      requestedCrop: { x: 0, y: 0, width: 1600, height: 900 },
      sourceRect: { x: 128, y: 72, width: 2304, height: 1296 },
    });
  });

  it('rejects observed viewport remapping for TAB_CROP and out-of-source frames', () => {
    const full = resolveFullTab();
    expect(() =>
      remapTabOutputGeometryFromObservedViewport(
        full,
        { width: 2560, height: 1440 },
        { x: 2000, y: 0, width: 800, height: 720 },
        full.coordinateSpace
      )
    ).toThrow('outside the raw tab source');

    expect(() =>
      remapTabOutputGeometryFromObservedViewport(
        { ...full, tracksFullViewport: false },
        full.sourceSize,
        full.sourceRect,
        full.coordinateSpace
      )
    ).toThrow('only valid for full viewport output');
  });

  it('contains the available source when a TAB_CROP remap no longer fits', () => {
    const initial = resolveTabOutputGeometry(
      { x: 700, y: 300, width: 300, height: 300 },
      { width: 2560, height: 1440 },
      { width: 1280, height: 720, devicePixelRatio: 2 },
      { frameRateCap: 30, resolution: VideoResolutionPreset.SOURCE }
    );

    const outcome = remapTabOutputGeometry(
      initial,
      { width: 1920, height: 1080 },
      { width: 800, height: 600, devicePixelRatio: 2 }
    );

    expect(outcome).toMatchObject({
      kind: 'recoverable-contain',
      geometry: {
        fit: 'contain',
        outputBasis: { width: 300, height: 300 },
        outputSize: { width: 300, height: 300 },
        requestedCrop: { x: 700, y: 300, width: 300, height: 300 },
        sourceRect: { x: 240, y: 0, width: 1440, height: 1080 },
      },
      warning: 'Tab crop no longer fits the resized viewport; containing the available frame',
    });
    expect(outcome.geometry.outputBasis).toBe(initial.outputBasis);
    expect(outcome.geometry.outputSize).toBe(initial.outputSize);
  });

  it('revalidates through the canonical mapper', () => {
    const geometry = resolveFullTab();
    expect(revalidateTabOutputGeometry(geometry, { width: 2560, height: 1440 })).toBe(true);
    expect(revalidateTabOutputGeometry(geometry, { width: 1920, height: 1080 })).toBe(false);
    expect(isSameTabOutputGeometry(geometry, { ...geometry })).toBe(true);
  });
});
