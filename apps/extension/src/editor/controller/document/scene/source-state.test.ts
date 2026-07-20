// @vitest-environment jsdom

import { Canvas } from 'fabric';
import { describe, expect, it, vi } from 'vitest';

import type { SourceState } from '../../../document/model/source-state';

const mocks = vi.hoisted(() => ({
  getSourceObjectMock: vi.fn(),
}));

vi.mock('../layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../layers')>()),
  getSourceObject: mocks.getSourceObjectMock,
}));

import { resolveRelayoutSourceState } from './source-state';

function createSourceState(): SourceState {
  return {
    dataUrl: 'data:image/png;base64,abc',
    displayHeight: 50,
    displayWidth: 100,
    id: 'source-image-layer',
    intrinsicHeight: 50,
    intrinsicWidth: 100,
    left: 10,
    locked: true,
    name: 'source',
    top: 20,
    visible: true,
  };
}

function registerLayoutFallbackTest() {
  it('uses relayout geometry when no source object owns current metrics', () => {
    mocks.getSourceObjectMock.mockReturnValue(null);

    expect(
      resolveRelayoutSourceState(new Canvas(), createSourceState(), {
        height: 80,
        left: 16,
        top: 24,
        width: 120,
      })
    ).toEqual(
      expect.objectContaining({
        displayHeight: 80,
        displayWidth: 120,
        id: 'source-image-layer',
        left: 16,
        top: 24,
      })
    );
  });
}

function registerCanvasObjectAuthorityTest() {
  it('lets the source canvas object remain authoritative for persisted source state', () => {
    mocks.getSourceObjectMock.mockReturnValue({
      getScaledHeight: vi.fn(() => 180),
      getScaledWidth: vi.fn(() => 320),
      left: 18,
      sniptaleId: 'canvas-source',
      sniptaleLocked: false,
      top: 28,
      visible: false,
    });

    expect(
      resolveRelayoutSourceState(new Canvas(), createSourceState(), {
        height: 80,
        left: 16,
        top: 24,
        width: 120,
      })
    ).toEqual(
      expect.objectContaining({
        displayHeight: 180,
        displayWidth: 320,
        id: 'canvas-source',
        left: 18,
        locked: false,
        top: 28,
        visible: false,
      })
    );
  });
}

function registerCanvasObjectFallbackTest() {
  it('falls back only missing canvas object fields to current identity and relayout geometry', () => {
    mocks.getSourceObjectMock.mockReturnValue({
      getScaledHeight: vi.fn(() => 180),
      getScaledWidth: vi.fn(() => 320),
      sniptaleLocked: true,
    });

    expect(
      resolveRelayoutSourceState(new Canvas(), createSourceState(), {
        height: 80,
        left: 16,
        top: 24,
        width: 120,
      })
    ).toEqual(
      expect.objectContaining({
        displayHeight: 180,
        displayWidth: 320,
        id: 'source-image-layer',
        left: 16,
        locked: true,
        top: 24,
        visible: true,
      })
    );
  });
}

describe('editor-controller scene source state owner', () => {
  registerLayoutFallbackTest();
  registerCanvasObjectAuthorityTest();
  registerCanvasObjectFallbackTest();
});
