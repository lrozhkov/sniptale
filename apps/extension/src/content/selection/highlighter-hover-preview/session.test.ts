// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import {
  resetFrameSessionBorderPreset,
  setFrameSessionBorderPreset,
} from '../frame-runtime/session/border-preset';
import {
  createHoverSession,
  getCurrentBorderPreset,
  invalidateHoverFrameCache,
  readHoverFrameCache,
} from './session';

afterEach(() => {
  resetFrameSessionBorderPreset();
  vi.clearAllMocks();
});

describe('highlighter hover session', () => {
  it('creates one empty session for overlay, tracking, and frame cache state', () => {
    const session = createHoverSession();

    expect(session).toMatchObject({
      frameCacheDirty: true,
      hoverOverlay: null,
      hoverRafId: null,
      isHoverPreviewFrozen: false,
      lastHoverTarget: null,
      overlayContainer: null,
    });
    expect(session.frameCache.size).toBe(0);
  });

  it('reads the canonical frame-session preset after every replay', () => {
    const restoredPreset = {
      ...DEFAULT_BORDER_PRESET,
      id: 'restored-preset',
      name: 'Restored preset',
      padding: { bottom: 7, left: 6, right: 5, top: 4 },
    };

    setFrameSessionBorderPreset(restoredPreset);

    expect(getCurrentBorderPreset()).toEqual(restoredPreset);
    expect(getCurrentBorderPreset()).not.toBe(restoredPreset);
  });

  it('invalidates frame cache through the session owner', () => {
    const session = createHoverSession();
    session.frameCacheDirty = false;

    invalidateHoverFrameCache(session);

    expect(session.frameCacheDirty).toBe(true);
  });

  it('refreshes a dirty frame cache once and then reuses it', () => {
    const session = createHoverSession();
    const element = document.createElement('div');
    const entry = { element };
    const refresh = vi.fn(() => [['frame', entry] as const]);

    expect(readHoverFrameCache(session, refresh).get('frame')).toBe(entry);
    expect(readHoverFrameCache(session, refresh).get('frame')).toBe(entry);

    expect(refresh).toHaveBeenCalledOnce();
    expect(session.frameCacheDirty).toBe(false);
  });
});
