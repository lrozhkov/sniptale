import { useRef, useState } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { getContentRuntimeServices } from '../../../application/runtime-services/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { logToolbarReactActionReached } from '../shell/event-diagnostics';
import type { ToolbarProps } from '../types';

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

  const toggleMode = async (mode: ToolbarToggleMode) => {
    logToolbarReactActionReached(`toggle-mode:${mode}`);
    if (inFlightRef.current) {
      return;
    }

    const next = toggles[mode];
    setPendingInteractionMode(resolvePendingInteractionMode(mode, next.enabled));

    inFlightRef.current = true;
    params.setIsLoading(true);
    try {
      const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
        type: next.enabled ? next.enable : next.disable,
      });

      if (!response?.success) {
        logger.error('Failed to toggle mode', response?.error);
        return;
      }

      if (params.aiPickMode) {
        params.onDisableAiPickMode?.();
      }

      next.apply(next.enabled);
    } catch (error) {
      logger.error('Failed to toggle mode', error);
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
