// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const frameCoords = vi.hoisted(() => ({
  calculateFrameContainerCoords: vi.fn(() => ({
    height: 30,
    width: 40,
    x: 12,
    y: 16,
  })),
  createFrameCalcSettings: vi.fn((settings) => settings),
}));
const contentUiRoot = vi.hoisted(() => ({
  appendToContentOverlayRoot: vi.fn((node) => {
    document.body.appendChild(node);
    return node;
  }),
  queryAllContentUiElements: vi.fn<(selector: string) => Element[]>(() => []),
}));
const isolatedRoot = vi.hoisted(() => ({
  applyIsolatedContentRootStyle: vi.fn(),
}));
const framePosition = vi.hoisted(() => ({
  getAbsolutePosition: vi.fn(() => ({ height: 10, width: 12, x: 1, y: 2 })),
}));
const logger = vi.hoisted(() => ({ debug: vi.fn(), warn: vi.fn() }));
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
    opacity: 80,
    order: 0,
    padding: {
      bottom: 4,
      left: 4,
      right: 4,
      top: 4,
    },
    radius: 6,
    shadow: 30,
    style: 'solid' as const,
    width: 2,
  },
}));

vi.mock('../frame-runtime/coords', () => frameCoords);
vi.mock('../../platform/frame', () => framePosition);
vi.mock('../../platform/dom-host', () => contentUiRoot);
vi.mock('../../platform/dom-host/isolated', () => isolatedRoot);
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: vi.fn(() => logger),
}));
vi.mock('../../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/highlighter')>()),
  ...storage,
}));

import {
  createHoverOverlayActions,
  ensureHighlighterOverlayContainer,
  ensureHoverOverlay,
  hideHoverOverlay,
  removeHighlighterOverlayContainer,
  removeHoverOverlay,
  showHoverOverlay,
} from './overlay';
import { createHoverSession } from './session';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  document.body.classList.remove('sniptale-capture-ui-hidden');
  document.body.replaceChildren();
});

function createState() {
  return {
    cachedHighlighterSettings: null,
    frameCache: new Map(),
    frameCacheDirty: false,
    hoverOverlay: null as HTMLElement | null,
    overlayContainer: null as HTMLElement | null,
    settingsLoadPromise: null,
  };
}

function shouldCreateAndReuseTheOverlayContainer(): void {
  const state = createState();

  const first = ensureHighlighterOverlayContainer(state);
  const second = ensureHighlighterOverlayContainer(state);

  expect(first).toBe(second);
  expect(contentUiRoot.appendToContentOverlayRoot).toHaveBeenCalledOnce();
  expect(isolatedRoot.applyIsolatedContentRootStyle).toHaveBeenCalledOnce();
}

function shouldCreateAndUpdateTheHoverOverlay(): void {
  const state = createState();
  const overlay = ensureHoverOverlay(state, storage.DEFAULT_BORDER_PRESET);

  showHoverOverlay(
    state,
    { height: 10, width: 12, x: 1, y: 2 },
    {
      ...storage.DEFAULT_BORDER_PRESET,
      color: '#0ff',
      id: 'custom',
      name: 'Custom',
      order: 1,
      shadow: 100,
    }
  );
  hideHoverOverlay(state);

  expect(overlay.style.top).toBe('16px');
  expect(overlay.style.left).toBe('12px');
  expect(overlay.style.width).toBe('40px');
  expect(overlay.style.height).toBe('30px');
  expect(overlay.style.borderColor).toBe('rgb(0, 255, 255)');
  expect(overlay.style.opacity).toBe('0');
}

function shouldKeepHoverPreviewHiddenWhileCaptureUiIsHidden(): void {
  const state = createState();
  const overlay = ensureHoverOverlay(state, storage.DEFAULT_BORDER_PRESET);
  document.body.classList.add('sniptale-capture-ui-hidden');

  showHoverOverlay(state, { height: 10, width: 12, x: 1, y: 2 }, storage.DEFAULT_BORDER_PRESET);

  expect(overlay.style.display).not.toBe('block');
  expect(overlay.style.opacity).toBe('0');
}

function shouldRemoveOverlayArtifactsAndResetState(): void {
  const state = createState();
  state.overlayContainer = document.createElement('div');
  state.hoverOverlay = document.createElement('div');
  const staleContainer = document.createElement('div');
  const staleOverlay = document.createElement('div');
  contentUiRoot.queryAllContentUiElements
    .mockReturnValueOnce([staleContainer])
    .mockReturnValueOnce([staleOverlay]);

  removeHighlighterOverlayContainer(state);
  state.hoverOverlay = document.createElement('div');
  removeHoverOverlay(state);

  expect(state.overlayContainer).toBeNull();
  expect(state.hoverOverlay).toBeNull();
}

function shouldExposeOverlayActionsOverOneSession(): void {
  const session = createHoverSession();
  session.cachedHighlighterSettings = {
    borderPresets: [storage.DEFAULT_BORDER_PRESET],
    defaultBorderPresetId: storage.DEFAULT_BORDER_PRESET.id,
  } as typeof session.cachedHighlighterSettings;
  const actions = createHoverOverlayActions(session);
  const target = document.createElement('button');

  actions.showHoverOverlay(target);

  expect(framePosition.getAbsolutePosition).toHaveBeenCalledWith(target);
  expect(session.overlayContainer).not.toBeNull();
  expect(session.hoverOverlay?.style.display).toBe('block');
  expect(logger.debug).toHaveBeenCalledWith(
    'Showing hover overlay',
    expect.objectContaining({
      calculatedCoords: framePosition.getAbsolutePosition.mock.results[0]?.value,
    })
  );
}

describe('highlighter hover overlay', () => {
  it('creates and reuses the overlay container', shouldCreateAndReuseTheOverlayContainer);
  it('creates and updates the hover overlay', shouldCreateAndUpdateTheHoverOverlay);
  it(
    'keeps hover preview hidden while capture UI is hidden',
    shouldKeepHoverPreviewHiddenWhileCaptureUiIsHidden
  );
  it('removes overlay artifacts and resets state', shouldRemoveOverlayArtifactsAndResetState);
  it('exposes overlay actions over one session', shouldExposeOverlayActionsOverOneSession);
});
