import type { MutableRefObject } from 'react';
import type {
  BlurSettings,
  FocusSettings,
  GlobalStepBadgeSettings,
} from '../../../../features/highlighter/contracts';
import {
  addCalloutDeleteListener,
  addCalloutPopoverSettingsChangedListener,
  addFocusOpacityChangedListener,
  addFrameCalloutChangedListener,
  addFrameStepBadgeChangedListener,
  addSessionBlurSettingsChangedListener,
  addSessionFocusSettingsChangedListener,
  addStepBadgeReorderListener,
} from '../../../platform/page-context/frame-events';

function createSessionSettingsCleanups(args: {
  sessionBlurSettingsRef: MutableRefObject<BlurSettings>;
  sessionDefaultsInitializedRef: MutableRefObject<boolean>;
  sessionFocusSettingsRef: MutableRefObject<FocusSettings>;
  syncFocusOpacity: (sourceFrameId: string, newOpacity: number) => void;
}) {
  return [
    addFocusOpacityChangedListener(({ frameId, opacity }) => {
      args.syncFocusOpacity(frameId, opacity);
    }),
    addSessionBlurSettingsChangedListener(({ settings }) => {
      args.sessionBlurSettingsRef.current = { ...settings };
      args.sessionDefaultsInitializedRef.current = true;
    }),
    addSessionFocusSettingsChangedListener(({ settings }) => {
      args.sessionFocusSettingsRef.current = { ...settings };
      args.sessionDefaultsInitializedRef.current = true;
    }),
  ] as Array<() => void>;
}

export function createFrameSessionListenerCleanups(args: {
  frameCalloutHandlers: {
    handleCalloutDelete: (detail: { frameId: string }) => void;
    handleCalloutPopoverSettingsChanged: (detail: {
      frameId: string;
      settings: Record<string, unknown>;
    }) => void;
    handleFrameCalloutChanged: (detail: {
      frameId: string;
      settings: Record<string, unknown>;
    }) => void;
  };
  frameStepBadgeHandlers: {
    handleFrameStepBadgeChanged: (detail: {
      frameId: string;
      settings: Record<string, unknown>;
    }) => void;
    handleGlobalStepBadgeSettingsChanged: (settings: Partial<GlobalStepBadgeSettings>) => void;
    handleStepBadgeReorder: (detail: { direction: 'up' | 'down'; frameId: string }) => void;
  };
  sessionBlurSettingsRef: MutableRefObject<BlurSettings>;
  sessionDefaultsInitializedRef: MutableRefObject<boolean>;
  sessionFocusSettingsRef: MutableRefObject<FocusSettings>;
  syncFocusOpacity: (sourceFrameId: string, newOpacity: number) => void;
}) {
  return [
    ...createSessionSettingsCleanups({
      sessionBlurSettingsRef: args.sessionBlurSettingsRef,
      sessionDefaultsInitializedRef: args.sessionDefaultsInitializedRef,
      sessionFocusSettingsRef: args.sessionFocusSettingsRef,
      syncFocusOpacity: args.syncFocusOpacity,
    }),
    registerLegacyGlobalStepBadgeSettingsListener(
      args.frameStepBadgeHandlers.handleGlobalStepBadgeSettingsChanged
    ),
    addFrameStepBadgeChangedListener(args.frameStepBadgeHandlers.handleFrameStepBadgeChanged),
    addStepBadgeReorderListener(args.frameStepBadgeHandlers.handleStepBadgeReorder),
    addFrameCalloutChangedListener(args.frameCalloutHandlers.handleFrameCalloutChanged),
    addCalloutPopoverSettingsChangedListener(
      args.frameCalloutHandlers.handleCalloutPopoverSettingsChanged
    ),
    addCalloutDeleteListener(args.frameCalloutHandlers.handleCalloutDelete),
  ] as Array<() => void>;
}

export function registerLegacyGlobalStepBadgeSettingsListener(
  listener: (settings: Partial<GlobalStepBadgeSettings>) => void,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window
) {
  const wrappedListener = (event: Event) => {
    if (!(event instanceof CustomEvent)) {
      return;
    }

    const settings = parseLegacyGlobalStepBadgeSettingsEventDetail(event.detail);
    if (!settings) {
      return;
    }

    listener(settings);
  };

  target.addEventListener('sniptale-global-step-badge-settings-changed', wrappedListener);
  return () => {
    target.removeEventListener('sniptale-global-step-badge-settings-changed', wrappedListener);
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseLegacyGlobalStepBadgeSettingsEventDetail(
  detail: unknown
): Partial<GlobalStepBadgeSettings> | null {
  const settings = isRecord(detail) ? detail['settings'] : null;
  if (!isRecord(settings)) {
    return null;
  }

  const settingsKeys = Object.keys(settings);
  if (
    settingsKeys.length !== 1 ||
    settingsKeys[0] !== 'autoMode' ||
    typeof settings['autoMode'] !== 'boolean'
  ) {
    return null;
  }

  return { autoMode: settings['autoMode'] };
}
