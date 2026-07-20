import { describe, expect, it, vi } from 'vitest';
import { createQuickEditEnableGuards, createQuickEditModeHandlers } from './controller.helpers';

describe('quick-edit-runtime controller helpers', () => {
  it('enables quick edit mode only once per active session', () => {
    let isQuickEditMode = false;
    const guards = createQuickEditEnableGuards({
      getIsQuickEditMode: () => isQuickEditMode,
    });

    expect(guards.startEnableFlow()).toBe(true);
    expect(isQuickEditMode).toBe(false);
    isQuickEditMode = true;
    expect(guards.startEnableFlow()).toBe(false);
  });

  it('runs cleanup only when the mode can be disabled', () => {
    const disableEditingSessions = vi.fn();
    const cleanupModeResources = vi.fn();
    const handlers = createQuickEditModeHandlers({
      cleanupModeResources,
      disableDocumentMode: vi.fn(),
      disableEditingSessions,
      disableMode: vi.fn(() => true),
      enableMode: vi.fn(() => false),
      enableModeListeners: vi.fn(() => 2),
      setIsQuickEditMode: vi.fn(),
    });

    handlers.enable();
    handlers.disable();

    expect(disableEditingSessions).toHaveBeenCalledTimes(1);
    expect(cleanupModeResources).toHaveBeenCalledTimes(1);
  });

  it('marks the runtime enabled only after listener setup succeeds', () => {
    const setIsQuickEditMode = vi.fn();
    const handlers = createQuickEditModeHandlers({
      cleanupModeResources: vi.fn(),
      disableDocumentMode: vi.fn(),
      disableEditingSessions: vi.fn(),
      disableMode: vi.fn(() => false),
      enableMode: vi.fn(() => true),
      enableModeListeners: vi.fn(() => 2),
      setIsQuickEditMode,
    });

    handlers.enable();

    expect(setIsQuickEditMode).toHaveBeenCalledWith(true);
  });
});
