// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const contentUiRoot = vi.hoisted(() => ({
  getContentUiElementById: vi.fn<(id: string) => HTMLElement | null>(),
  isContentOwnedElement: vi.fn<(node: Node | null) => boolean>(() => false),
  queryAllContentUiElements: vi.fn<(selector: string) => Element[]>(() => []),
  queryContentUiElement: vi.fn<(selector: string) => Element | null>(),
}));
const logger = vi.hoisted(() => ({
  error: vi.fn(),
}));
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

vi.mock('../../platform/dom-host', () => contentUiRoot);
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: vi.fn(() => logger),
}));
vi.mock('../../../composition/persistence/highlighter', () => storage);

import {
  applyHighlighterSettingsChange,
  createHighlighterHoverState,
  ensureHighlighterSettingsLoaded,
  getCurrentBorderPreset,
  isHighlighterExtensionUiElement,
  isNearExistingFrameBorder,
} from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  document.body.replaceChildren();
});

function createPresetState() {
  const state = createHighlighterHoverState();
  state.cachedHighlighterSettings = {
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
  return state;
}

function shouldCreateEmptyHoverState(): void {
  const state = createHighlighterHoverState();

  expect(state.hoverOverlay).toBeNull();
  expect(state.overlayContainer).toBeNull();
  expect(state.frameCacheDirty).toBe(true);
  expect(state.frameCache.size).toBe(0);
}

async function shouldLoadAndCacheHighlighterSettings(): Promise<void> {
  const settings = createPresetState().cachedHighlighterSettings;
  const state = createHighlighterHoverState();
  storage.loadHighlighterSettings.mockResolvedValueOnce(settings);

  await ensureHighlighterSettingsLoaded(state);
  await ensureHighlighterSettingsLoaded(state);

  expect(storage.loadHighlighterSettings).toHaveBeenCalledOnce();
  expect(state.cachedHighlighterSettings).toEqual(settings);
}

async function shouldLogWhenSettingsLoadFails(): Promise<void> {
  const state = createHighlighterHoverState();
  const error = new Error('load failed');
  storage.loadHighlighterSettings.mockRejectedValueOnce(error);

  await ensureHighlighterSettingsLoaded(state);
  storage.loadHighlighterSettings.mockResolvedValueOnce(
    createPresetState().cachedHighlighterSettings
  );
  await ensureHighlighterSettingsLoaded(state);

  expect(logger.error).toHaveBeenCalledWith('Failed to load highlighter settings', error);
  expect(storage.loadHighlighterSettings).toHaveBeenCalledTimes(2);
  expect(state.cachedHighlighterSettings).toEqual(createPresetState().cachedHighlighterSettings);
}

function shouldResolveBorderPresetsAndFrameExclusionZones(): void {
  const state = createPresetState();
  const frame = document.createElement('div');
  frame.id = 'frame-1';
  frame.getBoundingClientRect = vi.fn(() => ({
    bottom: 60,
    height: 20,
    left: 20,
    right: 40,
    top: 40,
    width: 20,
    x: 20,
    y: 40,
    toJSON: () => ({}),
  }));
  contentUiRoot.queryAllContentUiElements.mockReturnValueOnce([frame]);

  expect(getCurrentBorderPreset(state)).toEqual(
    expect.objectContaining({
      color: '#0ff',
      id: 'custom',
    })
  );
  expect(isNearExistingFrameBorder(state, 15, 45)).toBe(true);
  expect(isNearExistingFrameBorder(state, 30, 50)).toBe(false);
  expect(contentUiRoot.queryAllContentUiElements).toHaveBeenCalledOnce();
}

function shouldApplyKnownDefaultPresetChangesWithoutReloading(): void {
  const state = createPresetState();

  expect(
    applyHighlighterSettingsChange(state, {
      defaultBorderPresetId: 'default',
    })
  ).toBe(true);
  expect(state.cachedHighlighterSettings?.defaultBorderPresetId).toBe('default');
}

function shouldDetectExtensionOwnedTargetsAcrossUiSeams(): void {
  const directTarget = document.createElement('button');
  directTarget.classList.add('sniptale-highlight');

  expect(isHighlighterExtensionUiElement(directTarget)).toBe(true);

  const portal = document.createElement('div');
  const portaledTarget = document.createElement('span');
  portal.appendChild(portaledTarget);
  contentUiRoot.getContentUiElementById.mockReturnValueOnce(portal);
  expect(isHighlighterExtensionUiElement(portaledTarget)).toBe(true);

  const ownedRoot = document.createElement('div');
  const ownedTarget = document.createElement('span');
  ownedRoot.appendChild(ownedTarget);
  contentUiRoot.isContentOwnedElement.mockImplementation((node: Node | null) => node === ownedRoot);
  expect(isHighlighterExtensionUiElement(ownedTarget)).toBe(true);

  const toolbar = document.createElement('div');
  toolbar.className = 'sniptale-toolbar';
  const toolbarTarget = document.createElement('span');
  toolbar.appendChild(toolbarTarget);
  document.body.appendChild(toolbar);
  expect(isHighlighterExtensionUiElement(toolbarTarget)).toBe(true);

  const toolbarWrapper = document.createElement('div');
  toolbarWrapper.className = 'sniptale-toolbar-portal-wrapper';
  const toolbarWrapperTarget = document.createElement('button');
  toolbarWrapper.appendChild(toolbarWrapperTarget);
  contentUiRoot.queryContentUiElement.mockReturnValueOnce(toolbarWrapper);
  expect(isHighlighterExtensionUiElement(toolbarWrapperTarget)).toBe(true);
}

describe('highlighter hover preview helpers', () => {
  it('creates an empty hover state', shouldCreateEmptyHoverState);
  it('loads and caches highlighter settings', shouldLoadAndCacheHighlighterSettings);
  it('logs when the settings load fails', shouldLogWhenSettingsLoadFails);
  it(
    'resolves border presets and frame exclusion zones',
    shouldResolveBorderPresetsAndFrameExclusionZones
  );
  it(
    'applies known default preset changes without forcing a reload',
    shouldApplyKnownDefaultPresetChangesWithoutReloading
  );
  it(
    'detects extension-owned targets across UI seams',
    shouldDetectExtensionOwnedTargetsAcrossUiSeams
  );
});
