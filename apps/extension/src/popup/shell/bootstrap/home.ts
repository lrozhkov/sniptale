import { getQuickActions } from '../../../composition/persistence/quick-actions';
import type { QuickAction } from '../../../contracts/settings';
import { translate } from '../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { trackPopupPerfAsync } from '../../diagnostics/performance';
import {
  loadScreenshotSetupState,
  type ScreenshotSetupState,
} from '../../../composition/persistence/capture-settings';

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
  screenshotSetupState: ScreenshotSetupState;
};

type PopupHomeBootstrapPromises = {
  quickActionsPromise: Promise<QuickAction[]>;
  screenshotSetupStatePromise: Promise<ScreenshotSetupState>;
};

export function createPopupHomeBootstrapPromises(): PopupHomeBootstrapPromises {
  return {
    quickActionsPromise: trackPopupPerfAsync('popup.bootstrap.quick-actions', getQuickActions),
    screenshotSetupStatePromise: trackPopupPerfAsync(
      'popup.bootstrap.screenshot-setup',
      loadScreenshotSetupState
    ),
  };
}

export async function loadPopupHomeBootstrapData(
  promises: PopupHomeBootstrapPromises
): Promise<PopupHomeBootstrapData> {
  const [advisoryQuickActions, screenshotSetupState] = await Promise.all([
    loadAdvisoryBootstrapValue({
      fallback: [],
      failureMessage: 'Failed to bootstrap quick actions',
      warningMessage: translate('popup.home.quickActionsLoadError'),
      task: promises.quickActionsPromise,
    }),
    promises.screenshotSetupStatePromise,
  ]);

  return {
    homeError: advisoryQuickActions.warning,
    actions: advisoryQuickActions.value,
    screenshotSetupState,
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
