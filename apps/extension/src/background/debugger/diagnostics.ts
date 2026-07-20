import { browserDebugger } from '@sniptale/platform/browser/debugger';
import { createLogger } from '@sniptale/platform/observability/logger';
import { withTimeout } from './infra';
import { DEBUGGER_TIMEOUT_MS } from './constants';

const logger = createLogger({ namespace: 'BackgroundDebuggerDiagnostics' });

export async function enableDiagnosticsDomains(tabId: number): Promise<void> {
  logger.log('Enabling diagnostics domains for tab', tabId);

  try {
    await withTimeout(
      browserDebugger.sendCommand({ tabId }, 'Runtime.enable', {}),
      DEBUGGER_TIMEOUT_MS,
      'Runtime.enable'
    );
    logger.log('Runtime.enable done');

    await withTimeout(
      browserDebugger.sendCommand({ tabId }, 'Network.enable', {
        maxTotalBufferSize: 10000000,
        maxResourceBufferSize: 5000000,
      }),
      DEBUGGER_TIMEOUT_MS,
      'Network.enable'
    );
    logger.log('Network.enable done');

    logger.log('Diagnostics domains enabled');
  } catch (error) {
    logger.error('Failed to enable diagnostics domains', error);
    throw error;
  }
}

export async function disableDiagnosticsDomains(tabId: number): Promise<void> {
  logger.log('Disabling diagnostics domains for tab', tabId);

  try {
    await withTimeout(
      browserDebugger.sendCommand({ tabId }, 'Network.disable', {}),
      DEBUGGER_TIMEOUT_MS,
      'Network.disable'
    );

    await withTimeout(
      browserDebugger.sendCommand({ tabId }, 'Runtime.disable', {}),
      DEBUGGER_TIMEOUT_MS,
      'Runtime.disable'
    );

    logger.log('Diagnostics domains disabled');
  } catch (error) {
    logger.error('Failed to disable diagnostics domains', error);
    // Не бросаем ошибку - это не критично
  }
}
