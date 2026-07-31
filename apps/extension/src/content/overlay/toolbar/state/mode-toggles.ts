import { useRef, useState } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { getContentRuntimeServices } from '../../../application/runtime-services/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { translate } from '../../../../platform/i18n';
import { logToolbarReactActionReached } from '../shell/event-diagnostics';
import type { ToolbarProps } from '../types';
import {
  createDisableScreenshotModeRequest,
  getScreenshotSurfaceCapabilityToken,
  type ScreenshotSurfaceBindingSnapshot,
} from '../../viewport-selector/capability';
import { refreshToolbarSurfaceSession, renewToolbarSurfaceSession } from '../shell/surface-session';
import {
  attachContentActionIntent,
  createTrustedContentActionIntentSource,
} from '../../../application/privileged-action-intent';

const logger = createLogger({ namespace: 'ContentToolbarModeToggles' });

interface UseToolbarModeTogglesParams {
  aiPickMode: boolean;
  screenshotMode: boolean;
  highlighterMode: boolean;
  quickEditMode: boolean;
  propHighlighterMode?: boolean;
  propQuickEditMode?: boolean;
  onDisableAiPickMode?: () => void;
  onToggleScreenshotMode: ToolbarProps['onToggleScreenshotMode'];
  onToggleHighlighterMode: ToolbarProps['onToggleHighlighterMode'];
  onToggleQuickEditMode: ToolbarProps['onToggleQuickEditMode'];
  onClearHighlights: ToolbarProps['onClearHighlights'];
  setIsLoading: (loading: boolean) => void;
}

type PendingToolbarInteractionMode = 'highlighter' | 'quick-edit' | null;
type ToolbarToggleMode = 'screenshot' | 'highlighter' | 'quickedit';

async function recoverScreenshotSurfaceForExit(
  contentIntentSource: ReturnType<typeof createTrustedContentActionIntentSource> | undefined
): Promise<
  | { kind: 'already-disabled' }
  | { kind: 'request'; request: ReturnType<typeof createDisableScreenshotModeRequest> }
> {
  const status = await refreshToolbarSurfaceSession();
  if (status?.success && status.enabled === false) {
    return { kind: 'already-disabled' };
  }
  const statusCapabilityToken = status?.success ? status.surfaceCapabilityToken : undefined;
  if (status?.success && status.enabled && statusCapabilityToken) {
    const statusBinding: ScreenshotSurfaceBindingSnapshot = {
      surfaceCapabilityToken: statusCapabilityToken,
      surfaceOperationGeneration: status.surfaceOperationGeneration ?? 0,
      ...(status.surfaceLeaseGeneration === undefined
        ? {}
        : { surfaceLeaseGeneration: status.surfaceLeaseGeneration }),
    };
    return { kind: 'request', request: createDisableScreenshotModeRequest(statusBinding) };
  }
  if (getScreenshotSurfaceCapabilityToken()) {
    return { kind: 'request', request: createDisableScreenshotModeRequest() };
  }
  const renewedBinding = await renewToolbarSurfaceSession(contentIntentSource);
  return {
    kind: 'request',
    request: createDisableScreenshotModeRequest(renewedBinding),
  };
}

async function sendScreenshotModeDisable(
  contentIntentSource: ReturnType<typeof createTrustedContentActionIntentSource> | undefined
) {
  let recoveryAttempted = false;
  let request: ReturnType<typeof createDisableScreenshotModeRequest>;
  if (!getScreenshotSurfaceCapabilityToken()) {
    recoveryAttempted = true;
    const recovery = await recoverScreenshotSurfaceForExit(contentIntentSource);
    if (recovery.kind === 'already-disabled') {
      return { success: true as const };
    }
    request = recovery.request;
  } else {
    request = createDisableScreenshotModeRequest();
  }

  let response = await getContentRuntimeServices().messaging.sendRuntimeMessage(request);
  if (
    !response?.success &&
    (response?.error === 'authorization-expired' || response?.error === 'stale-generation') &&
    !recoveryAttempted
  ) {
    recoveryAttempted = true;
    const recovery = await recoverScreenshotSurfaceForExit(contentIntentSource);
    if (recovery.kind === 'already-disabled') {
      return { success: true as const };
    }
    response = await getContentRuntimeServices().messaging.sendRuntimeMessage(recovery.request);
  }
  return response;
}

function createModeToggles(params: UseToolbarModeTogglesParams) {
  const {
    screenshotMode,
    highlighterMode,
    quickEditMode,
    propHighlighterMode,
    propQuickEditMode,
    onToggleScreenshotMode,
    onToggleHighlighterMode,
    onToggleQuickEditMode,
    onClearHighlights,
  } = params;

  return {
    screenshot: {
      enabled: !screenshotMode,
      enable: MessageType.ENABLE_SCREENSHOT_MODE,
      disable: MessageType.DISABLE_SCREENSHOT_MODE,
      apply: (enabled: boolean) => {
        onToggleScreenshotMode(enabled);
        if (!enabled) onClearHighlights();
      },
    },
    highlighter: {
      enabled: !highlighterMode,
      enable: MessageType.ENABLE_HIGHLIGHTER_MODE,
      disable: MessageType.DISABLE_HIGHLIGHTER_MODE,
      apply: (enabled: boolean) => {
        onToggleHighlighterMode(enabled);
        if (enabled && propQuickEditMode !== undefined) {
          onToggleQuickEditMode(false);
        }
      },
    },
    quickedit: {
      enabled: !quickEditMode,
      enable: MessageType.ENABLE_QUICK_EDIT_MODE,
      disable: MessageType.DISABLE_QUICK_EDIT_MODE,
      apply: (enabled: boolean) => {
        onToggleQuickEditMode(enabled);
        if (enabled && propHighlighterMode !== undefined) {
          onToggleHighlighterMode(false);
        }
      },
    },
  } as const;
}

export function useToolbarModeToggles(params: UseToolbarModeTogglesParams) {
  const inFlightRef = useRef(false);
  const [pendingInteractionMode, setPendingInteractionMode] =
    useState<PendingToolbarInteractionMode>(null);
  const toggles = createModeToggles(params);

  const toggleMode = async (mode: ToolbarToggleMode, activationEvent?: Event) => {
    logToolbarReactActionReached(`toggle-mode:${mode}`);
    if (inFlightRef.current) {
      return;
    }

    const next = toggles[mode];
    const contentIntentSource =
      mode === 'screenshot' && activationEvent
        ? createTrustedContentActionIntentSource(activationEvent)
        : undefined;
    setPendingInteractionMode(resolvePendingInteractionMode(mode, next.enabled));

    inFlightRef.current = true;
    params.setIsLoading(true);
    try {
      const response =
        mode === 'screenshot' && next.enabled
          ? await getContentRuntimeServices().messaging.sendRuntimeMessage(
              await attachContentActionIntent(
                { type: MessageType.ENABLE_SCREENSHOT_MODE },
                contentIntentSource
              )
            )
          : mode === 'screenshot' && !next.enabled
            ? await sendScreenshotModeDisable(contentIntentSource)
            : await getContentRuntimeServices().messaging.sendRuntimeMessage({
                type: next.enabled ? next.enable : next.disable,
              });

      if (!response?.success) {
        logger.error('Failed to toggle mode', response?.error);
        if (mode === 'screenshot' && !next.enabled) {
          showToast(translate('content.toolbar.screenshotDisableError'), 'error');
        }
        return;
      }

      if (params.aiPickMode) {
        params.onDisableAiPickMode?.();
      }

      next.apply(next.enabled);
    } catch (error) {
      logger.error('Failed to toggle mode', error);
      if (mode === 'screenshot' && !next.enabled) {
        showToast(translate('content.toolbar.screenshotDisableError'), 'error');
      }
    } finally {
      inFlightRef.current = false;
      setPendingInteractionMode(null);
      params.setIsLoading(false);
    }
  };

  return {
    pendingInteractionMode,
    toggleMode,
  };
}

function resolvePendingInteractionMode(
  mode: ToolbarToggleMode,
  enabled: boolean
): PendingToolbarInteractionMode {
  if (!enabled) {
    return null;
  }

  if (mode === 'quickedit') {
    return 'quick-edit';
  }

  return mode === 'highlighter' ? 'highlighter' : null;
}
