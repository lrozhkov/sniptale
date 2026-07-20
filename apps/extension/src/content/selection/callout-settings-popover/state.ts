import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { dispatchCalloutPopoverSettingsChanged } from '../../platform/page-context/frame-events';
import { pagePreparationHistory } from '../../parser/page-preparation/history';
import { normalizeCalloutSettings } from './helpers';

function dispatchCalloutSettingsChange(
  frameId: string,
  key: keyof CalloutSettings,
  value: unknown
) {
  dispatchCalloutPopoverSettingsChanged({ frameId, settings: { [key]: value } });
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

  const handleSettingChange = (key: keyof CalloutSettings, value: unknown) => {
    const nextSettings = { ...localSettings, [key]: value };
    setLocalSettings(nextSettings);
    dispatchCalloutSettingsChange(args.frameId, key, value);
  };

  return {
    handleSettingChange,
    isTextOnly: localSettings.variant === 'text-only',
    localSettings,
  };
}
