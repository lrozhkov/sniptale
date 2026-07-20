// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import {
  addContentModeDisabledListener,
  addContentModeEnabledListener,
} from '../../platform/page-context/mode-events';
import { createQuickEditController } from './controller';

function createRuntimeControllerStub() {
  return {
    documentMode: {
      disable: vi.fn(),
      enable: vi.fn(),
      isEnabled: vi.fn(() => false),
    },
    editing: {
      getEditingElements: vi.fn(() => new Map()),
    },
    mode: {
      disable: vi.fn(),
      enable: vi.fn(),
      isEnabled: vi.fn(),
    },
  };
}

it('enables quick-edit through the owning facade and updates mode-session wiring', () => {
  const runtimeController = createRuntimeControllerStub();
  runtimeController.mode.isEnabled.mockReturnValue(false);
  const deactivateOtherModes = vi.fn();
  const setModeEnabled = vi.fn();
  const controller = createQuickEditController({
    createRuntimeController: () => runtimeController,
    deactivateOtherModes,
    setModeEnabled,
  });

  controller.enableMode();

  expect(deactivateOtherModes).toHaveBeenCalledWith('quick-edit');
  expect(runtimeController.mode.enable).toHaveBeenCalledTimes(1);
  expect(setModeEnabled).toHaveBeenCalledWith('quick-edit', true);
  const enableOrder = runtimeController.mode.enable.mock.invocationCallOrder[0];
  const setModeEnabledOrder = setModeEnabled.mock.invocationCallOrder[0];
  if (enableOrder === undefined || setModeEnabledOrder === undefined) {
    throw new Error('Expected quick-edit enable ordering');
  }
  expect(enableOrder).toBeLessThan(setModeEnabledOrder);
});

it('disables quick-edit through the owning facade and reuses the runtime editing map', () => {
  const editingElements = new Map([['field-1', { id: 'field-1' }]]);
  const runtimeController = createRuntimeControllerStub();
  runtimeController.mode.isEnabled.mockReturnValue(true);
  runtimeController.editing.getEditingElements.mockReturnValue(editingElements);
  const setModeEnabled = vi.fn();
  const controller = createQuickEditController({
    createRuntimeController: () => runtimeController,
    setModeEnabled,
  });

  controller.disableMode();

  expect(runtimeController.mode.disable).toHaveBeenCalledTimes(1);
  expect(setModeEnabled).toHaveBeenCalledWith('quick-edit', false);
  const disableOrder = runtimeController.mode.disable.mock.invocationCallOrder[0];
  const setModeEnabledOrder = setModeEnabled.mock.invocationCallOrder[0];
  if (disableOrder === undefined || setModeEnabledOrder === undefined) {
    throw new Error('Expected quick-edit disable ordering');
  }
  expect(disableOrder).toBeLessThan(setModeEnabledOrder);
  expect(controller.getEditingElements()).toBe(editingElements);
});

it('handles runtime disable requests through the same facade-owned lifecycle', () => {
  let onDisableRequested: (() => void) | undefined;
  const runtimeController = createRuntimeControllerStub();
  runtimeController.mode.isEnabled.mockReturnValue(true);
  const dispatchModeDisabled = vi.fn();
  const setModeEnabled = vi.fn();
  createQuickEditController({
    createRuntimeController: (options) => {
      onDisableRequested = options.onDisableRequested;
      return runtimeController;
    },
    dispatchModeDisabled,
    setModeEnabled,
  });

  onDisableRequested?.();

  expect(setModeEnabled).toHaveBeenCalledWith('quick-edit', false);
  expect(runtimeController.mode.disable).toHaveBeenCalledTimes(1);
  expect(dispatchModeDisabled).toHaveBeenCalledTimes(1);
});

it('emits the shared mode-disabled event when the runtime requests a quick-edit shutdown', () => {
  let onDisableRequested: (() => void) | undefined;
  const runtimeController = createRuntimeControllerStub();
  runtimeController.mode.isEnabled.mockReturnValue(true);
  const listener = vi.fn();
  const cleanup = addContentModeDisabledListener(listener);
  createQuickEditController({
    createRuntimeController: (options) => {
      onDisableRequested = options.onDisableRequested;
      return runtimeController;
    },
    setModeEnabled: vi.fn(),
  });

  onDisableRequested?.();

  expect(listener).toHaveBeenCalledWith({ mode: 'quick-edit' });

  cleanup();
});

it('emits the shared mode-enabled event when quick-edit starts outside React controls', () => {
  const runtimeController = createRuntimeControllerStub();
  runtimeController.mode.isEnabled.mockReturnValue(false);
  const listener = vi.fn();
  const cleanup = addContentModeEnabledListener(listener);
  const controller = createQuickEditController({
    createRuntimeController: () => runtimeController,
    setModeEnabled: vi.fn(),
  });

  controller.enableMode();

  expect(listener).toHaveBeenCalledWith({ mode: 'quick-edit' });

  cleanup();
});

it('forwards document mode controls only while quick-edit is enabled', () => {
  const runtimeController = createRuntimeControllerStub();
  runtimeController.mode.isEnabled.mockReturnValueOnce(false).mockReturnValue(true);
  const controller = createQuickEditController({
    createRuntimeController: () => runtimeController,
  });

  controller.enableDocumentMode();
  controller.enableDocumentMode();
  controller.disableDocumentMode();

  expect(runtimeController.documentMode.enable).toHaveBeenCalledTimes(1);
  expect(runtimeController.documentMode.disable).toHaveBeenCalledTimes(1);
  expect(controller.isDocumentModeEnabled()).toBe(false);
});
