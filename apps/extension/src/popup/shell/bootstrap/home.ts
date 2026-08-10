import { getQuickActions } from '../../../composition/persistence/quick-actions';
import type { QuickAction } from '../../../contracts/settings';
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
};

type PopupHomeBootstrapPromises = {
  quickActionsPromise: Promise<QuickAction[]>;
};

export function createPopupHomeBootstrapPromises(): PopupHomeBootstrapPromises {
  return {
    quickActionsPromise: trackPopupPerfAsync('popup.bootstrap.quick-actions', getQuickActions),
  };
}

export async function loadPopupHomeBootstrapData(
  promises: PopupHomeBootstrapPromises
): Promise<PopupHomeBootstrapData> {
  const advisoryQuickActions = await loadAdvisoryBootstrapValue({
    fallback: [],
    failureMessage: 'Failed to bootstrap quick actions',
    warningMessage: translate('popup.home.quickActionsLoadError'),
    task: promises.quickActionsPromise,
  });

  return {
    homeError: advisoryQuickActions.warning,
    actions: advisoryQuickActions.value,
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
