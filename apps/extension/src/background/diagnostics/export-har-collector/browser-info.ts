import { browserDebugger } from '@sniptale/platform/browser/debugger';
import { createLogger } from '@sniptale/platform/observability/logger';
import { resolveHarBrowserMetadata } from './helpers';

const logger = createLogger({ namespace: 'ExportHAR' });

type BrowserVersionResponse = {
  product?: string;
  userAgent?: string;
};

export async function resolveHarBrowserInfo(tabId: number): Promise<{
  browserName: string;
  browserVersion: string;
}> {
  try {
    const browserVersion = await browserDebugger.sendCommand<BrowserVersionResponse>(
      { tabId },
      'Browser.getVersion'
    );
    const metadata = resolveHarBrowserMetadata(browserVersion);
    return {
      browserName: metadata.name,
      browserVersion: metadata.version,
    };
  } catch (error) {
    logger.warn('Failed to resolve HAR browser metadata', error, { tabId });
    return {
      browserName: 'Chromium',
      browserVersion: '',
    };
  }
}
