import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { browserWebNavigation } from '@sniptale/platform/browser/web-navigation';
import { subscribeToChromeEvent } from '@sniptale/platform/browser/callback';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  PAGE_RECOVERY_CONTENT_PORT,
  parsePageRecoveryRequest,
} from '../../contracts/page-recovery';
import { pageRecoveryService, type PageRecoverySource } from './service';

const EXPIRY_ALARM = 'sniptale-page-recovery-expiry';
const logger = createLogger({ namespace: 'PageRecovery' });

/** Native Port metadata is the only source of tab, document and page identity. */
export function pageRecoverySource(
  sender: chrome.runtime.MessageSender | undefined
): PageRecoverySource | null {
  if (
    !sender ||
    sender.id !== new URL(browserRuntime.getURL('')).hostname ||
    sender.frameId !== 0 ||
    sender.documentLifecycle !== 'active' ||
    !sender.documentId ||
    !Number.isSafeInteger(sender.tab?.id) ||
    sender.tab!.id! < 0 ||
    !sender.url
  )
    return null;
  try {
    const url = new URL(sender.url);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return { tabId: sender.tab!.id!, documentId: sender.documentId, pageUrl: url.href };
  } catch {
    return null;
  }
}
export function registerPageRecoveryPorts(): () => void {
  const maintain = async () => {
    const deadline = await pageRecoveryService.maintenance();
    if (deadline === null) await chrome.alarms.clear(EXPIRY_ALARM);
    else await chrome.alarms.create(EXPIRY_ALARM, { when: deadline });
  };
  const reportMaintenanceFailure = () => logger.warn('Page recovery expiry cleanup failed');
  const disconnect = browserRuntime.subscribeToConnections((port) => {
    if (port.name !== PAGE_RECOVERY_CONTENT_PORT) return;
    const source = pageRecoverySource(port.sender);
    if (!source) {
      port.disconnect();
      return;
    }
    const connection = pageRecoveryService.connect(source, () => port.disconnect());
    const onMessage = (value: unknown) => {
      const message = parsePageRecoveryRequest(value);
      if (!message) {
        connection.disconnect();
        return;
      }
      void connection.request(message).then((reply) => {
        try {
          port.postMessage(reply);
        } catch {
          connection.disconnect();
        }
        if (message.kind === 'save' || message.kind === 'save-final' || message.kind === 'discard')
          void maintain().catch(reportMaintenanceFailure);
      });
    };
    const onDisconnect = () => {
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      connection.disconnect();
    };
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
  });
  const navigation = browserWebNavigation.subscribeToCommitted((details) => {
    if (details.frameId === 0 && details.documentId)
      pageRecoveryService.navigate(details.tabId, details.documentId);
  });
  const removed = browserTabs.subscribeToRemoved((tabId) => {
    void pageRecoveryService
      .forgetTab(tabId)
      .catch(() => logger.warn('Page recovery tab cleanup failed'));
  });
  const alarm = subscribeToChromeEvent(chrome.alarms?.onAlarm, (event) => {
    if (event.name === EXPIRY_ALARM) void maintain().catch(reportMaintenanceFailure);
  });
  void maintain().catch(reportMaintenanceFailure);
  return () => {
    disconnect();
    navigation();
    removed();
    alarm();
  };
}
