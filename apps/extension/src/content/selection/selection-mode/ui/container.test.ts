// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  appendToContentOverlayRootMock,
  applyIsolatedContentRootStyleMock,
  applyContentRuntimeThemeMock,
} = vi.hoisted(() => ({
  appendToContentOverlayRootMock: vi.fn(),
  applyIsolatedContentRootStyleMock: vi.fn(),
  applyContentRuntimeThemeMock: vi.fn(),
}));

vi.mock('../../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/dom-host')>()),
  appendToContentOverlayRoot: appendToContentOverlayRootMock,
}));

vi.mock('../../../platform/dom-host/isolated', () => ({
  applyIsolatedContentRootStyle: applyIsolatedContentRootStyleMock,
}));

vi.mock('../../../platform/page-context/dom', () => ({
  applyContentRuntimeTheme: applyContentRuntimeThemeMock,
}));

import { createOverlayContainer, createSelectionModeDom } from './container';

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
  applyContentRuntimeThemeMock.mockReset();
  appendToContentOverlayRootMock.mockImplementation((node: HTMLElement) => {
    document.body.appendChild(node);
    return node;
  });
});

function registerDomShellTest() {
  it('creates the DOM state shell with null-owned elements', () => {
    expect(createSelectionModeDom()).toEqual({
      overlayContainer: null,
      hoverFrame: null,
      scissorsIcon: null,
      hoverSizeLabel: null,
      dragFrame: null,
      finalFrame: null,
      finalOverlay: null,
      sizePanel: null,
      sizeTooltip: null,
      widthInput: null,
      heightInput: null,
      aspectRatioButton: null,
      cancelButton: null,
      dragEventCatcher: null,
    });
  });
}

function registerOverlayContainerTest() {
  it('creates the overlay container once and applies the runtime theme helper', () => {
    const dom = createSelectionModeDom();
    applyContentRuntimeThemeMock.mockImplementation((container: HTMLElement) => {
      container.dataset['theme'] = 'dark';
      container.style.colorScheme = 'dark';
    });

    createOverlayContainer(dom, { cancelSelection: vi.fn(), zIndexBase: 700 });
    createOverlayContainer(dom, { cancelSelection: vi.fn(), zIndexBase: 900 });

    expect(appendToContentOverlayRootMock).toHaveBeenCalledTimes(1);
    expect(applyIsolatedContentRootStyleMock).toHaveBeenCalledTimes(1);
    expect(applyContentRuntimeThemeMock).toHaveBeenCalledTimes(1);
    expect(applyIsolatedContentRootStyleMock.mock.calls[0]?.[0]).toBe(dom.overlayContainer);
    expect(applyIsolatedContentRootStyleMock.mock.calls[0]?.[1]).toContain('z-index: 700;');
    expect(dom.overlayContainer?.dataset['theme']).toBe('dark');
    expect(dom.overlayContainer?.style.colorScheme).toBe('dark');
    expect(dom.overlayContainer?.querySelector('style')?.textContent).toContain(
      '.sniptale-selection-size-panel'
    );
  });
}

function registerCancelButtonTest() {
  it('creates an idempotent floating cancel button that owns pointer cancellation', () => {
    const dom = createSelectionModeDom();
    const cancelSelection = vi.fn();
    const overlayPointerListener = vi.fn();

    createOverlayContainer(dom, { cancelSelection, zIndexBase: 700 });
    dom.overlayContainer?.addEventListener('click', overlayPointerListener);
    dom.overlayContainer?.addEventListener('mousedown', overlayPointerListener);
    createOverlayContainer(dom, { cancelSelection, zIndexBase: 900 });

    const button = dom.overlayContainer?.querySelector<HTMLButtonElement>(
      '.sniptale-selection-cancel-button'
    );

    expect(button).toBe(dom.cancelButton);
    expect(
      dom.overlayContainer?.querySelectorAll('.sniptale-selection-cancel-button')
    ).toHaveLength(1);
    expect(button?.getAttribute('aria-label')).toBe('Отменить скриншот');
    expect(button?.title).toBe('Отменить скриншот');
    expect(button?.style.position).toBe('fixed');
    expect(button?.style.pointerEvents).toBe('auto');
    expect(button?.style.boxSizing).toBe('border-box');
    expect(button?.style.lineHeight).toBe('1');
    expect(button?.style.appearance).toBe('none');
    expect(button?.style.display).toBe('grid');
    expect(button?.style.placeItems).toBe('center');
    expect(button?.querySelector('svg')).toBeNull();
    expect(button?.querySelector('.sniptale-selection-cancel-icon')).not.toBeNull();

    button?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(cancelSelection).toHaveBeenCalledTimes(1);
    expect(overlayPointerListener).not.toHaveBeenCalled();
  });
}

function registerThemeFallbackTest() {
  it('preserves runtime helper decisions when no theme is applied', () => {
    const dom = createSelectionModeDom();

    createOverlayContainer(dom, { cancelSelection: vi.fn(), zIndexBase: 500 });

    expect(dom.overlayContainer?.hasAttribute('data-theme')).toBe(false);
    expect(dom.overlayContainer?.style.colorScheme).toBe('');
  });
}

function runContainerSuite() {
  registerDomShellTest();
  registerOverlayContainerTest();
  registerCancelButtonTest();
  registerThemeFallbackTest();
}

describe('selection-mode ui container', runContainerSuite);
