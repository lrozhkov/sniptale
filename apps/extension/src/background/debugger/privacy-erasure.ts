import { browserDebugger } from '@sniptale/platform/browser/debugger';
import { DEBUGGER_TIMEOUT_MS } from './constants';
import { withTimeout } from './infra';

export async function disableDiagnosticsDomainsForPrivacyErasure(tabId: number): Promise<void> {
  await withTimeout(
    browserDebugger.sendCommand({ tabId }, 'Network.disable', {}),
    DEBUGGER_TIMEOUT_MS,
    'privacy.Network.disable'
  );
  await withTimeout(
    browserDebugger.sendCommand({ tabId }, 'Runtime.disable', {}),
    DEBUGGER_TIMEOUT_MS,
    'privacy.Runtime.disable'
  );
}
