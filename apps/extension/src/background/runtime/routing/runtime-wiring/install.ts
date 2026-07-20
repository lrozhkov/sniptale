import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { setLocalePreference } from '../../../../platform/i18n';
import { rebuildBackgroundContextMenus } from '../../context-menu/service';
import { parseInstalledDetails } from './parsers';
import type { RuntimeWiringLogger } from './shared';

function initializeFirstInstallLocale(logger: RuntimeWiringLogger): Promise<void> {
  return setLocalePreference('en').catch((error) => {
    logger.warn('Failed to initialize first-install locale', error);
  });
}

function rebuildContextMenus(logger: RuntimeWiringLogger): void {
  void rebuildBackgroundContextMenus().catch((error) => {
    logger.warn('Failed to rebuild context menus after install/update', error);
  });
}

export function registerInstallListener(logger: RuntimeWiringLogger): void {
  browserRuntime.subscribeToInstalled((details: unknown) => {
    const installDetails = parseInstalledDetails(details);
    if (!installDetails) {
      return;
    }

    logger.log('Extension installed or updated', installDetails.reason);

    if (installDetails.reason === 'install') {
      logger.log('First installation');
      void initializeFirstInstallLocale(logger).then(() => {
        rebuildContextMenus(logger);
      });
      return;
    } else if (installDetails.reason === 'update') {
      logger.log('Extension updated');
    }

    rebuildContextMenus(logger);
  });
}
