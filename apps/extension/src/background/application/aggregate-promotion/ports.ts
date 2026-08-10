import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { isOwnedExtensionPagePath } from '../../../platform/navigation/extension-pages/sender-url';
import {
  AGGREGATE_EDITOR_PRESENCE_PORT,
  parseAggregateEditorClientMessage,
} from '../../../contracts/aggregate-promotion';
import { registerAggregateEditorPresence } from './presence-registry';

function isAuthorizedAggregateEditor(
  kind: 'image' | 'scenario' | 'video-project',
  senderUrl: string
): boolean {
  const path =
    kind === 'image'
      ? 'apps/extension/src/editor/index.html'
      : kind === 'scenario'
        ? 'apps/extension/src/scenario-editor/index.html'
        : 'apps/extension/src/video-editor/index.html';
  return isOwnedExtensionPagePath(senderUrl, path);
}

function senderOwnsAggregate(
  aggregate: { id: string; kind: 'image' | 'scenario' | 'video-project' },
  senderUrl: string
): boolean {
  try {
    const search = new URL(senderUrl).searchParams;
    const ownedId =
      aggregate.kind === 'image'
        ? search.get('assetId')
        : aggregate.kind === 'scenario'
          ? search.get('projectId')
          : search.get('project');
    return ownedId === aggregate.id;
  } catch {
    return false;
  }
}

export function registerAggregateEditorPresencePorts(): () => void {
  const stopPorts = new Set<() => void>();
  const unsubscribe = browserRuntime.subscribeToConnections((port) => {
    if (port.name !== AGGREGATE_EDITOR_PRESENCE_PORT) return;
    let unregister: (() => void) | null = null;
    let stopped = false;
    const stop = (disconnect: boolean) => {
      if (stopped) return;
      stopped = true;
      unregister?.();
      unregister = null;
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      stopPorts.delete(stopForShutdown);
      if (disconnect) port.disconnect();
    };
    const stopForShutdown = () => stop(true);
    const onMessage = (rawMessage: unknown) => {
      if (stopped) return;
      const message = parseAggregateEditorClientMessage(rawMessage);
      if (message?.type !== 'register') return;
      const documentId = port.sender?.documentId;
      const senderUrl = port.sender?.url;
      if (
        !documentId ||
        !senderUrl ||
        !isAuthorizedAggregateEditor(message.aggregate.kind, senderUrl) ||
        !senderOwnsAggregate(message.aggregate, senderUrl)
      ) {
        stop(true);
        return;
      }
      unregister?.();
      unregister = registerAggregateEditorPresence({
        aggregate: message.aggregate,
        documentId,
        port,
        senderUrl,
      });
    };
    const onDisconnect = () => stop(false);
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
    stopPorts.add(stopForShutdown);
  });
  return () => {
    unsubscribe();
    for (const stop of [...stopPorts]) stop();
  };
}
