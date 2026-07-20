import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChromeAiAvailability } from '@sniptale/platform/browser/chrome-ai';
import {
  ChromeAiRuntimeError,
  loadChromeAiAvailability,
  prepareChromeAiSession,
} from '@sniptale/platform/browser/chrome-ai';
import { isChromeAiModelId } from '../../../../features/ai/chrome/constants';
import { resolveSelectedAIModelId } from '../../../../features/ai/selection';
import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { saveChromeAiEnabled } from '../runtime/settings-mutations';
import type { AIModel } from '../../../../contracts/settings';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { saveAiProvidersDefaultModel } from './save';

const logger = createLogger({ namespace: 'SettingsAiProvidersChromeAi' });

function normalizeChromeAiToggleError(error: unknown): string {
  if (error instanceof ChromeAiRuntimeError) {
    return error.reason === 'unsupported'
      ? translate('background.runtime.chromeAiUnsupported')
      : translate('background.runtime.chromeAiUnexpectedError');
  }

  return error instanceof Error
    ? error.message
    : translate('background.runtime.chromeAiUnexpectedError');
}

type ChromeAiToggleArgs = {
  chromeAiEnabled: boolean;
  defaultModelId: string | null;
  models: AIModel[];
  reloadData: () => Promise<void>;
  setChromeAiEnabled: (value: boolean) => void;
  setDefaultModelId: (value: string | null) => void;
};

function useChromeAiAvailabilityState() {
  const [availability, setAvailability] = useState<ChromeAiAvailability>('unsupported');
  const [isChecking, setIsChecking] = useState(true);
  const requestIdRef = useRef(0);

  const refreshAvailability = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsChecking(true);

    try {
      const nextAvailability = await loadChromeAiAvailability();

      if (requestId === requestIdRef.current) {
        setAvailability(nextAvailability);
      }
    } catch (loadError) {
      if (requestId === requestIdRef.current) {
        logger.error('Failed to load Chrome AI availability', loadError);
        setAvailability('unsupported');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsChecking(false);
      }
    }
  }, []);

  useEffect(() => {
    void refreshAvailability();
  }, [refreshAvailability]);

  return { availability, isChecking, refreshAvailability };
}

async function disableChromeAi(args: ChromeAiToggleArgs): Promise<void> {
  await saveChromeAiEnabled(false);
  args.setChromeAiEnabled(false);

  if (isChromeAiModelId(args.defaultModelId)) {
    const nextDefaultModelId = resolveSelectedAIModelId(args.models, null);
    const didSave = await saveAiProvidersDefaultModel(nextDefaultModelId, args.setDefaultModelId);

    if (!didSave) {
      return;
    }
  }

  await args.reloadData();
}

async function enableChromeAi(args: {
  availability: ChromeAiAvailability;
  refreshAvailability: () => Promise<void>;
  setError: (value: string | null) => void;
  setIsSettingUp: (value: boolean) => void;
  setSetupProgress: (value: number | null) => void;
  toggleArgs: ChromeAiToggleArgs;
}): Promise<void> {
  if (args.availability === 'unsupported' || args.availability === 'unavailable') {
    args.setError(translate('settings.aiProviders.chromeAiUnsupported'));
    return;
  }

  args.setIsSettingUp(true);
  args.setSetupProgress(null);

  try {
    if (args.availability !== 'available') {
      await prepareChromeAiSession({
        onDownloadProgress: (progress) => {
          args.setSetupProgress(Math.round(progress * 100));
        },
      });
    }

    await saveChromeAiEnabled(true);
    args.toggleArgs.setChromeAiEnabled(true);
    await args.toggleArgs.reloadData();
    await args.refreshAvailability();
    toast.success(translate('settings.aiProviders.chromeAiEnabledMessage'));
  } catch (toggleError) {
    const message = normalizeChromeAiToggleError(toggleError);
    logger.error('Failed to enable Chrome AI', toggleError);
    args.setError(message);
    toast.error(message);
  } finally {
    args.setIsSettingUp(false);
  }
}

export function useAiProvidersChromeAiState(args: ChromeAiToggleArgs) {
  const [error, setError] = useState<string | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupProgress, setSetupProgress] = useState<number | null>(null);
  const { availability, isChecking, refreshAvailability } = useChromeAiAvailabilityState();

  const handleToggle = useCallback(async () => {
    if (isChecking || isSettingUp) {
      return;
    }

    setError(null);

    if (args.chromeAiEnabled) {
      await disableChromeAi(args);
      return;
    }

    await enableChromeAi({
      availability,
      refreshAvailability,
      setError,
      setIsSettingUp,
      setSetupProgress,
      toggleArgs: args,
    });
  }, [args, availability, isChecking, isSettingUp, refreshAvailability]);

  return {
    availability,
    enabled: args.chromeAiEnabled,
    error,
    handleToggle,
    isChecking,
    isSettingUp,
    setupProgress,
  };
}
