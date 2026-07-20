// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { createQuickEditModeHelpers } from './controller-disable';
import { buildEditableElementRecord, createQuickEditOverlayState } from './helpers';

function createEditingElements() {
  return new Map([
    ['first', buildEditableElementRecord(document.createElement('div'))],
    ['second', buildEditableElementRecord(document.createElement('div'))],
  ]);
}

function createOverlayState() {
  return createQuickEditOverlayState();
}

describe('quick-edit-runtime controller-disable editing sessions', () => {
  it('finishes every active editing session before disable completes', () => {
    const finishEditing = vi.fn();
    const helpers = createQuickEditModeHelpers({
      editingElements: createEditingElements(),
      finishEditing,
      getCleanupEventListeners: () => null,
      getIsQuickEditMode: () => true,
      overlayActions: {
        disconnectResizeObserver: vi.fn(),
        removeBlockingOverlay: vi.fn(),
        removeHoverOverlay: vi.fn(),
      },
      overlayState: createOverlayState(),
      setCleanupEventListeners: vi.fn(),
      setIsQuickEditMode: vi.fn(),
    });

    helpers.disableHelpers.disableEditingSessions();

    expect(finishEditing).toHaveBeenCalledTimes(2);
  });
});

describe('quick-edit-runtime controller-disable resources', () => {
  it('clears listener cleanup state and overlay resources when disabling', () => {
    const cleanupListeners = vi.fn();
    const removeHoverOverlay = vi.fn();
    const removeBlockingOverlay = vi.fn();
    const disconnectResizeObserver = vi.fn();
    const setCleanupEventListeners = vi.fn();
    const helpers = createQuickEditModeHelpers({
      editingElements: createEditingElements(),
      finishEditing: vi.fn(),
      getCleanupEventListeners: () => cleanupListeners,
      getIsQuickEditMode: () => true,
      overlayActions: {
        disconnectResizeObserver,
        removeBlockingOverlay,
        removeHoverOverlay,
      },
      overlayState: createOverlayState(),
      setCleanupEventListeners,
      setIsQuickEditMode: vi.fn(),
    });

    helpers.disableHelpers.cleanupModeResources();

    expect(cleanupListeners).toHaveBeenCalledOnce();
    expect(setCleanupEventListeners).toHaveBeenCalledWith(null);
    expect(removeHoverOverlay).toHaveBeenCalledOnce();
    expect(removeBlockingOverlay).toHaveBeenCalledOnce();
    expect(disconnectResizeObserver).toHaveBeenCalledOnce();
  });
});
