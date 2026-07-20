// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { FrameState } from '../../../../features/highlighter/contracts';

const syncMocks = vi.hoisted(() => ({
  renderInteractiveFrames: vi.fn(),
}));

vi.mock('./dom', () => ({
  renderInteractiveFrames: syncMocks.renderInteractiveFrames,
}));

import { renderPreparedFrameRoots } from './sync';
const InteractiveFrameComponent = vi.fn(() => null);

function createFrame(id: string) {
  return {
    borderSettings: {
      color: '#000',
      customCss: '',
      fillColor: '#00000000',
      fillOpacity: 0,
      inheritCustomCss: false,
      strokeOpacity: 100,
      id: 'border',
      isSystemDefault: true,
      name: 'Default',
      opacity: 1,
      order: 0,
      padding: { bottom: 0, left: 0, right: 0, top: 0 },
      radius: 4,
      shadow: 0,
      style: 'solid' as const,
      width: 2,
    },
    effectMode: 'border' as const,
    height: 40,
    id,
    width: 80,
    x: 0,
    y: 0,
  };
}

describe('frame-roots-renderer-sync', () => {
  it('renders interactive frames and flips the cancellation flag in cleanup', () => {
    const cleanup = renderPreparedFrameRoots({
      actionRefs: {
        removeFrameRef: { current: vi.fn() },
        updateFrameEffectRef: { current: vi.fn() },
        updateFrameRef: { current: vi.fn() },
        updateFrameStateRef: { current: vi.fn() },
      },
      globalEffectModeRef: { current: 'border' },
      InteractiveFrameComponent,
      renderState: {
        container: document.createElement('div'),
        currentFrames: [createFrame('frame-1')],
        currentFrameStates: new Map<string, FrameState>([['frame-1', 'idle']]),
      },
      rootsRef: { current: new Map() },
    });

    expect(syncMocks.renderInteractiveFrames).toHaveBeenCalledWith(
      expect.objectContaining({
        cancelled: false,
        InteractiveFrameComponent,
      })
    );

    cleanup();
  });
});
