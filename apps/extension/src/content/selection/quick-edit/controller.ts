import type { EditableElement } from '../../../features/highlighter/contracts';
import {
  dispatchContentModeDisabled,
  dispatchContentModeEnabled,
} from '../../platform/page-context/mode-events';
import { deactivateOtherContentModes, setContentModeEnabled } from '../../application/mode-session';
import { createQuickEditRuntimeController } from '../quick-edit-runtime';
import type { QuickEditRuntimeController } from '../quick-edit-runtime/types';

type QuickEditLogger = Pick<Console, 'log'>;

interface QuickEditControllerDeps {
  createRuntimeController?: (options: {
    onDisableRequested: () => void;
  }) => QuickEditRuntimeController;
  deactivateOtherModes?: (activeMode: 'quick-edit') => void;
  setModeEnabled?: (mode: 'quick-edit', enabled: boolean) => void;
  logger?: QuickEditLogger;
  dispatchModeDisabled?: () => void;
}

interface QuickEditController {
  disableMode: () => void;
  disableDocumentMode: () => void;
  enableMode: () => void;
  enableDocumentMode: () => void;
  getEditingElements: () => Map<string, EditableElement>;
  isEnabled: () => boolean;
  isDocumentModeEnabled: () => boolean;
}

function dispatchQuickEditModeDisabledEvent(): void {
  dispatchContentModeDisabled({ mode: 'quick-edit' });
}

function createRuntimeControllerInstance(
  deps: QuickEditControllerDeps,
  getController: () => QuickEditController
): QuickEditRuntimeController {
  const onDisableRequested = () => {
    getController().disableMode();
    (deps.dispatchModeDisabled ?? dispatchQuickEditModeDisabledEvent)();
  };

  return (
    deps.createRuntimeController?.({ onDisableRequested }) ??
    createQuickEditRuntimeController({
      onDisableRequested,
    })
  );
}

/**
 * Creates a quick-edit facade controller that owns the runtime instance and mode-session wiring.
 */
export function createQuickEditController(deps: QuickEditControllerDeps = {}): QuickEditController {
  const logger = deps.logger ?? console;
  const setModeEnabled = deps.setModeEnabled ?? setContentModeEnabled;
  const deactivateOtherModes = deps.deactivateOtherModes ?? deactivateOtherContentModes;
  let controller: QuickEditController;
  const runtimeController = createRuntimeControllerInstance(deps, () => controller);

  controller = {
    enableMode: () => {
      if (runtimeController.mode.isEnabled()) {
        logger.log('[Sniptale] Quick edit mode already enabled');
        return;
      }

      deactivateOtherModes('quick-edit');
      runtimeController.mode.enable();
      setModeEnabled('quick-edit', true);
      dispatchContentModeEnabled({ mode: 'quick-edit' });
    },

    disableMode: () => {
      if (!runtimeController.mode.isEnabled()) {
        logger.log('[Sniptale] Quick edit mode already disabled');
        return;
      }

      runtimeController.mode.disable();
      setModeEnabled('quick-edit', false);
    },

    enableDocumentMode: () => {
      if (!runtimeController.mode.isEnabled()) {
        logger.log('[Sniptale] Quick edit document mode requires quick edit mode');
        return;
      }

      runtimeController.documentMode.enable();
    },

    disableDocumentMode: () => {
      runtimeController.documentMode.disable();
    },

    isEnabled: () => runtimeController.mode.isEnabled(),
    isDocumentModeEnabled: () => runtimeController.documentMode.isEnabled(),
    getEditingElements: () => runtimeController.editing.getEditingElements(),
  };

  return controller;
}
