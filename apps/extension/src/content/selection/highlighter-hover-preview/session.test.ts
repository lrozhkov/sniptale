// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({ debug: vi.fn(), error: vi.fn() }));
const storage = vi.hoisted(() => ({
  DEFAULT_BORDER_PRESET: {
    color: '#ff0',
    customCss: '',
    fillColor: '#00000000',
    fillOpacity: 0,
    inheritCustomCss: false,
    strokeOpacity: 100,
    id: 'default',
    name: 'Default',
    opacity: 60,
    order: 0,
    padding: 4,
    radius: 6,
    shadow: 30,
    style: 'solid',
    width: 2,
  },
  loadHighlighterSettings: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: vi.fn(() => logger),
}));
vi.mock('../../../composition/persistence/highlighter', () => storage);

import {
  createHoverSession,
  ensureHighlighterSettingsLoaded,
  getCurrentBorderPreset,
  invalidateHighlighterSettings,
  invalidateHoverFrameCache,
  readHoverFrameCache,
} from './session';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function createSettings() {
  return {
    borderPresets: [
      storage.DEFAULT_BORDER_PRESET,
      {
        ...storage.DEFAULT_BORDER_PRESET,
        color: '#0ff',
        id: 'custom',
        name: 'Custom',
        order: 1,
      },
    ],
    defaultBorderPresetId: 'custom',
  } as Awaited<ReturnType<typeof storage.loadHighlighterSettings>>;
}

describe('highlighter hover session', () => {
  it('creates one empty session for overlay, tracking, settings, and frame cache state', () => {
    const session = createHoverSession();

    expect(session).toMatchObject({
      cachedHighlighterSettings: null,
      frameCacheDirty: true,
      hoverOverlay: null,
      hoverRafId: null,
      isHoverPreviewFrozen: false,
      lastHoverTarget: null,
      overlayContainer: null,
      settingsLoadPromise: null,
    });
    expect(session.frameCache.size).toBe(0);
  });

  it('loads settings once and resolves the selected preset', async () => {
    const session = createHoverSession();
    const settings = createSettings();
    storage.loadHighlighterSettings.mockResolvedValueOnce(settings);

    await Promise.all([
      ensureHighlighterSettingsLoaded(session),
      ensureHighlighterSettingsLoaded(session),
    ]);

    expect(storage.loadHighlighterSettings).toHaveBeenCalledOnce();
    expect(getCurrentBorderPreset(session)).toEqual(expect.objectContaining({ id: 'custom' }));
  });

  it('surfaces load failure and allows a later retry', async () => {
    const session = createHoverSession();
    const error = new Error('load failed');
    storage.loadHighlighterSettings.mockRejectedValueOnce(error);

    await ensureHighlighterSettingsLoaded(session);
    storage.loadHighlighterSettings.mockResolvedValueOnce(createSettings());
    await ensureHighlighterSettingsLoaded(session);

    expect(logger.error).toHaveBeenCalledWith('Failed to load highlighter settings', error);
    expect(storage.loadHighlighterSettings).toHaveBeenCalledTimes(2);
  });

  it('applies a known settings event without reloading', () => {
    const session = createHoverSession();
    session.cachedHighlighterSettings = createSettings();

    invalidateHighlighterSettings(session, { defaultBorderPresetId: 'default' });

    expect(session.cachedHighlighterSettings?.defaultBorderPresetId).toBe('default');
    expect(storage.loadHighlighterSettings).not.toHaveBeenCalled();
  });

  it('invalidates unknown settings and frame cache through the session owner', () => {
    const session = createHoverSession();
    session.cachedHighlighterSettings = createSettings();
    session.frameCacheDirty = false;
    storage.loadHighlighterSettings.mockResolvedValueOnce(createSettings());

    invalidateHighlighterSettings(session, { defaultBorderPresetId: 'missing' });
    invalidateHoverFrameCache(session);

    expect(session.cachedHighlighterSettings).toBeNull();
    expect(session.frameCacheDirty).toBe(true);
    expect(storage.loadHighlighterSettings).toHaveBeenCalledOnce();
  });

  it('refreshes a dirty frame cache once and then reuses it', () => {
    const session = createHoverSession();
    const element = document.createElement('div');
    const entry = { element, rect: new DOMRect(1, 2, 3, 4) };
    const refresh = vi.fn(() => [['frame', entry] as const]);

    expect(readHoverFrameCache(session, refresh).get('frame')).toBe(entry);
    expect(readHoverFrameCache(session, refresh).get('frame')).toBe(entry);

    expect(refresh).toHaveBeenCalledOnce();
    expect(session.frameCacheDirty).toBe(false);
  });
});
