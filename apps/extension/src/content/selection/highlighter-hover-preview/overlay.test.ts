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
vi.mock('../frame-runtime/session/border-preset', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../frame-runtime/session/border-preset')>()),
  getFrameSessionBorderPreset: () => storage.DEFAULT_BORDER_PRESET,
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
    frameCache: new Map(),
    frameCacheDirty: false,
    hoverOverlay: null as HTMLElement | null,
    overlayContainer: null as HTMLElement | null,
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
  expect(overlay.style.opacity).toBe('0.72');
  expect(overlay.style.borderStyle).toBe('solid');
  expect(overlay.style.borderWidth).toBe('2px');
  expect(overlay.style.borderRadius).toBe('6px');
  expect(overlay.style.boxShadow).not.toBe('none');
  hideHoverOverlay(state);

  expect(overlay.style.top).toBe('16px');
  expect(overlay.style.left).toBe('12px');
  expect(overlay.style.width).toBe('40px');
  expect(overlay.style.height).toBe('30px');
  expect(overlay.style.borderColor).toBe('rgb(0, 255, 255)');
  expect(overlay.style.opacity).toBe('0');
}

function shouldPreservePresetFillAndStrokeRatiosUnderUniformOpacity(): void {
  const state = createState();
  const overlay = ensureHoverOverlay(state, storage.DEFAULT_BORDER_PRESET);

  showHoverOverlay(
    state,
    { height: 10, width: 12, x: 1, y: 2 },
    {
      ...storage.DEFAULT_BORDER_PRESET,
      fillColor: '#60A5FA',
      fillOpacity: 8,
      strokeOpacity: 65,
    }
  );

  expect(overlay.style.opacity).toBe('0.72');
  expect(overlay.style.borderColor).toBe('rgba(255, 255, 0, 0.65)');
  expect(overlay.style.backgroundColor).toBe('rgba(96, 165, 250, 0.08)');
}

function shouldKeepCanonicalGeometryAndStrokeWhilePreservingCustomDecoration(): void {
  const state = createState();
  const position = { height: 10, width: 12, x: 1, y: 2 };

  showHoverOverlay(state, position, {
    ...storage.DEFAULT_BORDER_PRESET,
    customCss: [
      'background-color: red',
      'background-image: linear-gradient(red, blue)',
      'box-shadow: 0 0 4px red',
      'border: 20px dashed blue',
      'border-radius: 50px',
      'outline: 4px solid red',
      'outline-offset: 7px',
      'clip-path: inset(10px)',
      'clip: rect(0, 0, 0, 0)',
      'inset: 0',
      "offset-path: path('M 0 0 L 100 100')",
      'all: unset',
      'zoom: 2',
      'transition: none',
      '-webkit-transform: scale(2)',
      '-webkit-clip-path: inset(10px)',
      '-webkit-mask: linear-gradient(black, transparent)',
    ].join('; '),
    inheritCustomCss: true,
  });
  const overlay = state.hoverOverlay;
  expect(overlay?.style.boxSizing).toBe('border-box');
  expect(overlay?.style.borderWidth).toBe('2px');
  expect(overlay?.style.borderStyle).toBe('solid');
  expect(overlay?.style.borderColor).toBe('rgb(255, 255, 0)');
  expect(overlay?.style.borderRadius).toBe('6px');
  expect(overlay?.style.backgroundColor).toBe('red');
  expect(overlay?.style.backgroundImage).toBe('linear-gradient(red, blue)');
  expect(overlay?.style.boxShadow).toBe('0 0 4px red');
  expect(overlay?.style.outline).toBe('4px solid red');
  expect(overlay?.style.outlineOffset).toBe('7px');
  expect(overlay?.style.clipPath).toBe('none');
  expect(overlay?.style.transition).toContain('opacity 0.2s');
  expect(overlay?.style.top).toBe('16px');
  expect(overlay?.style.left).toBe('12px');
  expect(overlay?.style.width).toBe('40px');
  expect(overlay?.style.height).toBe('30px');
  expect(overlay?.style.clip).toBe('');
  expect(overlay?.style.getPropertyValue('zoom')).toBe('');
  expect(overlay?.style.getPropertyValue('-webkit-transform')).toBe('');
  expect(overlay?.style.getPropertyValue('-webkit-clip-path')).toBe('');
  expect(overlay?.style.getPropertyValue('-webkit-mask')).toBe('');
  expect(overlay?.style.zIndex).toBe('2147483645');

  showHoverOverlay(state, position, {
    ...storage.DEFAULT_BORDER_PRESET,
    customCss: '',
    inheritCustomCss: false,
  });

  expect(state.hoverOverlay).toBe(overlay);
  expect(overlay?.style.outline).toBe('none');
  expect(overlay?.style.outlineOffset).toBe('');
  expect(overlay?.style.clipPath).toBe('none');
  expect(overlay?.style.transition).toContain('opacity 0.2s');
}

function shouldKeepHoverPreviewHiddenWhileCaptureUiIsHidden(): void {
  const state = createState();
  const overlay = ensureHoverOverlay(state, storage.DEFAULT_BORDER_PRESET);
  document.body.classList.add('sniptale-capture-ui-hidden');

  showHoverOverlay(state, { height: 10, width: 12, x: 1, y: 2 }, storage.DEFAULT_BORDER_PRESET);

  expect(overlay.style.display).not.toBe('block');
  expect(overlay.style.opacity).toBe('0');
}

function shouldDisableMotionForReducedMotionPreference(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true }))
  );
  const state = createState();

  const overlay = ensureHoverOverlay(state, storage.DEFAULT_BORDER_PRESET);

  expect(overlay.style.transition).toBe('none');
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
    'preserves preset fill and stroke ratios under uniform opacity',
    shouldPreservePresetFillAndStrokeRatiosUnderUniformOpacity
  );
  it(
    'keeps canonical geometry and stroke while preserving custom decoration',
    shouldKeepCanonicalGeometryAndStrokeWhilePreservingCustomDecoration
  );
  it(
    'disables motion for reduced-motion preference',
    shouldDisableMotionForReducedMotionPreference
  );
  it(
    'keeps hover preview hidden while capture UI is hidden',
    shouldKeepHoverPreviewHiddenWhileCaptureUiIsHidden
  );
  it('removes overlay artifacts and resets state', shouldRemoveOverlayArtifactsAndResetState);
  it('exposes overlay actions over one session', shouldExposeOverlayActionsOverOneSession);
});
