import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { dispatchCalloutPopoverSettingsChanged } from '../../platform/page-context/frame-events';
import { pagePreparationHistory } from '../../parser/page-preparation/history';
import { normalizeCalloutSettings } from './helpers';
import {
  applyCalloutSettingsPatch,
  cloneCalloutStyle,
  type CalloutSettingsPatch,
} from '../callout/model';
import type { CalloutPreset } from '@sniptale/runtime-contracts/highlighter/callout';

function dispatchCalloutSettingsChange(frameId: string, settings: CalloutSettingsPatch) {
  dispatchCalloutPopoverSettingsChanged({ frameId, settings });
}

function useCalloutSettingsTransaction(args: {
  frameId: string;
  isOpen: boolean;
  prevIsOpenRef: MutableRefObject<boolean>;
}): void {
  useEffect(() => {
    const transactionKey = `callout-settings:${args.frameId}`;

    if (args.isOpen && !args.prevIsOpenRef.current) {
      pagePreparationHistory.beginTransaction(transactionKey);
    } else if (!args.isOpen && args.prevIsOpenRef.current) {
      pagePreparationHistory.commitTransaction(transactionKey);
    }

    args.prevIsOpenRef.current = args.isOpen;
  }, [args.frameId, args.isOpen, args.prevIsOpenRef]);
}

function useCalloutSettingsTransactionCleanup(args: {
  frameId: string;
  prevIsOpenRef: MutableRefObject<boolean>;
}): void {
  useEffect(() => {
    return () => cancelOpenCalloutSettingsTransaction(args.frameId, args.prevIsOpenRef);
  }, [args.frameId, args.prevIsOpenRef]);
}

function cancelOpenCalloutSettingsTransaction(
  frameId: string,
  prevIsOpenRef: MutableRefObject<boolean>
): void {
  if (prevIsOpenRef.current) {
    pagePreparationHistory.cancelTransaction(`callout-settings:${frameId}`);
  }
}

export function useCalloutSettingsPopoverState(args: {
  frameId: string;
  isOpen: boolean;
  settings?: CalloutSettings;
}) {
  const [localSettings, setLocalSettings] = useState<CalloutSettings>(
    normalizeCalloutSettings(args.settings)
  );
  const prevIsOpenRef = useRef(false);
  const settingsRef = useRef(args.settings);

  settingsRef.current = args.settings;

  useCalloutSettingsTransaction({ frameId: args.frameId, isOpen: args.isOpen, prevIsOpenRef });
  useCalloutSettingsTransactionCleanup({ frameId: args.frameId, prevIsOpenRef });

  useEffect(() => {
    if (!args.isOpen) {
      return;
    }

    setLocalSettings(normalizeCalloutSettings(settingsRef.current));
  }, [args.isOpen, args.settings]);

  const handleSettingChange = (patch: CalloutSettingsPatch) => {
    const resetsManualPlacement =
      patch.placement?.anchor !== undefined || patch.placement?.side !== undefined;
    const placementPatch: CalloutSettingsPatch = resetsManualPlacement
      ? {
          ...patch,
          placement: {
            ...patch.placement,
            manualPlacement: undefined,
            connectorBasePosition: undefined,
            connectorBaseWidth: undefined,
            connectorFramePosition: undefined,
          },
        }
      : patch;
    const normalizedPatch: CalloutSettingsPatch =
      patch.style && !('sourcePresetId' in patch)
        ? { ...placementPatch, sourcePresetId: undefined }
        : placementPatch;
    const nextSettings = applyCalloutSettingsPatch(localSettings, normalizedPatch);
    setLocalSettings(nextSettings);
    dispatchCalloutSettingsChange(args.frameId, normalizedPatch);
  };

  const applyPreset = (preset: CalloutPreset) => {
    handleSettingChange({ sourcePresetId: preset.id, style: cloneCalloutStyle(preset.style) });
  };

  return {
    handleSettingChange,
    applyPreset,
    localSettings,
  };
}
