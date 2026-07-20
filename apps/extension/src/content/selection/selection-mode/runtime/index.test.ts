// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import {
  buildSelectionCaptureArea,
  cleanupSelectionModeRuntime,
  isSelectionModeExtensionUiElement,
} from '.';
import { createSelectionModeDom } from '../ui';

function expectSelectionRuntimeCleanup() {
  const overlayContainer = document.createElement('div');
  document.body.appendChild(overlayContainer);

  const state = {
    aspectRatio: null,
    cleanupEventListeners: vi.fn(),
    cleanupScrollListeners: vi.fn(),
    currentState: 'confirmed' as const,
    dom: {
      ...createSelectionModeDom(),
      overlayContainer,
    },
    dragStartPoint: { x: 0, y: 0 },
    dragThreshold: 5,
    hasMovedEnough: true,
    hoveredElement: document.body,
    isActive: true,
    isDragging: true,
    isResizing: true,
    maintainAspectRatio: false,
    mouseDownPoint: { x: 10, y: 20 },
    rejectCallback: null,
    resolveCallback: null,
    resizeDirection: 'se' as const,
    selectionAtDragStart: { x: 0, y: 0, width: 0, height: 0 },
    skipNextClick: false,
  };

  cleanupSelectionModeRuntime(state, vi.fn());

  expect(state.cleanupEventListeners).toBeNull();
  expect(state.cleanupScrollListeners).toBeNull();
  expect(state.isActive).toBe(false);
  expect(state.currentState).toBe('idle');
  expect(state.isDragging).toBe(false);
  expect(state.isResizing).toBe(false);
  expect(state.resizeDirection).toBeNull();
  expect(state.hoveredElement).toBeNull();
  expect(state.mouseDownPoint).toBeNull();
  expect(state.hasMovedEnough).toBe(false);
  expect(document.body.contains(overlayContainer)).toBe(false);
  expect(state.dom.overlayContainer).toBeNull();
}

function expectSelectionRuntimeCleanupAfterFailure() {
  const overlayContainer = document.createElement('div');
  document.body.appendChild(overlayContainer);
  document.body.style.userSelect = 'none';
  document.body.style.webkitUserSelect = 'none';

  const state = {
    aspectRatio: null,
    cleanupEventListeners: vi.fn(() => {
      throw new Error('cleanup failed');
    }),
    cleanupScrollListeners: vi.fn(),
    currentState: 'drag' as const,
    dom: {
      ...createSelectionModeDom(),
      overlayContainer,
    },
    dragStartPoint: { x: 0, y: 0 },
    dragThreshold: 5,
    hasMovedEnough: true,
    hoveredElement: document.body,
    isActive: true,
    isDragging: true,
    isResizing: true,
    maintainAspectRatio: false,
    mouseDownPoint: { x: 10, y: 20 },
    rejectCallback: null,
    resolveCallback: null,
    resizeDirection: 'se' as const,
    selectionAtDragStart: { x: 0, y: 0, width: 0, height: 0 },
    skipNextClick: false,
  };

  expect(() => cleanupSelectionModeRuntime(state, vi.fn())).toThrow('cleanup failed');
  expect(state.cleanupEventListeners).toBeNull();
  expect(state.cleanupScrollListeners).toBeNull();
  expect(state.isActive).toBe(false);
  expect(state.currentState).toBe('idle');
  expect(document.body.style.userSelect).toBe('');
  expect(document.body.style.webkitUserSelect).toBe('');
  expect(document.body.contains(overlayContainer)).toBe(false);
}

function expectSelectionCaptureAreaRounding() {
  expect(buildSelectionCaptureArea({ x: 10.2, y: 20.8, width: 30.4, height: 40.6 })).toEqual({
    x: 10,
    y: 21,
    width: 30,
    height: 41,
  });
}

function expectSharedSizeTooltipIsExtensionUi() {
  const tooltip = document.createElement('div');
  tooltip.className = 'sniptale-content-size-tooltip';
  const button = document.createElement('button');
  tooltip.appendChild(button);
  document.body.appendChild(tooltip);

  expect(isSelectionModeExtensionUiElement(button)).toBe(true);
}

function expectHostPageShadowComponentIsNotExtensionUi() {
  const hostPageComponent = document.createElement('div');
  hostPageComponent.attachShadow({ mode: 'open' });
  document.body.appendChild(hostPageComponent);

  expect(isSelectionModeExtensionUiElement(hostPageComponent)).toBe(false);
}

function expectContentOwnedShadowElementIsExtensionUi() {
  const contentHost = document.createElement('div');
  contentHost.id = CONTENT_ROOT_ID;
  const shadowRoot = contentHost.attachShadow({ mode: 'open' });
  const toolbarButton = document.createElement('button');
  shadowRoot.appendChild(toolbarButton);
  document.body.appendChild(contentHost);

  expect(isSelectionModeExtensionUiElement(toolbarButton)).toBe(true);
}

function runSelectionModeRuntimeCleanupSuite() {
  it(
    'rounds the public capture area through the runtime owner',
    expectSelectionCaptureAreaRounding
  );
  it('marks the runtime inactive and tears down DOM state', expectSelectionRuntimeCleanup);
  it(
    'resets selection runtime state even when one cleanup callback fails',
    expectSelectionRuntimeCleanupAfterFailure
  );
  it('treats the shared size tooltip as extension UI', expectSharedSizeTooltipIsExtensionUi);
}

function runSelectionModeExtensionUiDetectionSuite() {
  it(
    'does not treat host page shadow components as extension UI',
    expectHostPageShadowComponentIsNotExtensionUi
  );
  it(
    'treats content-owned shadow elements as extension UI',
    expectContentOwnedShadowElementIsExtensionUi
  );
}

describe('selection-mode runtime cleanup', runSelectionModeRuntimeCleanupSuite);
describe('selection-mode extension UI detection', runSelectionModeExtensionUiDetectionSuite);
