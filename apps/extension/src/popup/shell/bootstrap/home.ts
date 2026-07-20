import { getQuickActionsBootstrapData } from '../../../composition/persistence/quick-actions';
import { DEFAULT_QUICK_ACTIONS_DISPLAY_MODE } from '../../../features/quick-actions-presets/display-mode';
import type { QuickAction, QuickActionsDisplayMode } from '../../../contracts/settings';
import { translate } from '../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { trackPopupPerfAsync } from '../../diagnostics/performance';

const logger = createLogger({ namespace: 'PopupBootstrap' });

type AdvisoryBootstrapLoadArgs<TValue> = {
  fallback: TValue;
  failureMessage: string;
  warningMessage: string;
  task: Promise<TValue>;
};

type AdvisoryBootstrapLoadResult<TValue> = {
  value: TValue;
  warning: string | null;
};

type PopupHomeBootstrapData = {
  actions: QuickAction[];
  homeError: string | null;
  quickActionsMode: QuickActionsDisplayMode;
};

type PopupHomeBootstrapPromises = {
  quickActionsPromise: Promise<{
    actions: QuickAction[];
    displayMode: QuickActionsDisplayMode;
  }>;
};

export function createPopupHomeBootstrapPromises(): PopupHomeBootstrapPromises {
  return {
    quickActionsPromise: trackPopupPerfAsync(
      'popup.bootstrap.quick-actions',
      getQuickActionsBootstrapData
    ),
  };
}

export async function loadPopupHomeBootstrapData(
  promises: PopupHomeBootstrapPromises
): Promise<PopupHomeBootstrapData> {
  const advisoryQuickActions = await loadAdvisoryBootstrapValue({
    fallback: {
      actions: [],
      displayMode: DEFAULT_QUICK_ACTIONS_DISPLAY_MODE,
    },
    failureMessage: 'Failed to bootstrap quick actions',
    warningMessage: translate('popup.home.quickActionsLoadError'),
    task: promises.quickActionsPromise,
  });

  return {
    homeError: advisoryQuickActions.warning,
    actions: advisoryQuickActions.value.actions,
    quickActionsMode: advisoryQuickActions.value.displayMode,
  };
}

async function loadAdvisoryBootstrapValue<TValue>({
  fallback,
  failureMessage,
  warningMessage,
  task,
}: AdvisoryBootstrapLoadArgs<TValue>): Promise<AdvisoryBootstrapLoadResult<TValue>> {
  try {
    return {
      value: await task,
      warning: null,
    };
  } catch (error) {
    logger.error(failureMessage, error);
    return {
      value: fallback,
      warning: warningMessage,
    };
  }
}
