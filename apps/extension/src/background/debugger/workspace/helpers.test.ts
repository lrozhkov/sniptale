import { describe, expect, it } from 'vitest';
import {
  buildViewportEmulationResult,
  calculateViewportScale,
  DEFAULT_WORKSPACE_SIZE,
  resolveAvailableWorkspaceFromLayoutMetrics,
} from './helpers';

function runDebuggerWorkspaceMetricsSuite() {
  it('prefers visual viewport metrics when available', verifyVisualViewportMetrics);

  it('caps viewport scale at native size', () => {
    expect(calculateViewportScale(DEFAULT_WORKSPACE_SIZE, 1280, 720)).toEqual({
      scale: 1,
      scaleX: 1.5,
      scaleY: 1.5,
    });
  });

  it('falls back to layout viewport metrics when visual viewport is missing', () => {
    expect(
      resolveAvailableWorkspaceFromLayoutMetrics(
        {
          layoutViewport: {
            clientWidth: 1400,
            clientHeight: 900,
          },
        },
        40
      )
    ).toEqual({
      width: 1400,
      height: 860,
    });
  });

  it('returns null when neither viewport metric set is available', () => {
    expect(resolveAvailableWorkspaceFromLayoutMetrics({}, 40)).toBeNull();
  });
}

function verifyVisualViewportMetrics(): void {
  expect(
    resolveAvailableWorkspaceFromLayoutMetrics(
      {
        visualViewport: {
          clientWidth: 1600,
          clientHeight: 900,
        },
        layoutViewport: {
          clientWidth: 1200,
          clientHeight: 800,
        },
      },
      79
    )
  ).toEqual({
    width: 1600,
    height: 821,
  });
}

function runDebuggerWorkspaceEmulationSuite() {
  it('falls back to scaled dimensions when layout metrics miss visual viewport', () => {
    expect(buildViewportEmulationResult({}, 1920, 1080, 0.5)).toEqual({
      cssWidth: 960,
      cssHeight: 540,
      scale: 0.5,
    });
  });

  it('prefers visual viewport dimensions when building the emulation result', () => {
    expect(
      buildViewportEmulationResult(
        {
          visualViewport: {
            clientWidth: 1280,
            clientHeight: 720,
          },
        },
        1920,
        1080,
        0.5
      )
    ).toEqual({
      cssWidth: 1280,
      cssHeight: 720,
      scale: 0.5,
    });
  });
}

describe('debugger workspace metrics helpers', runDebuggerWorkspaceMetricsSuite);
describe('debugger workspace emulation helpers', runDebuggerWorkspaceEmulationSuite);
