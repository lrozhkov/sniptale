import type { EditableAggregateRef } from '../../../contracts/aggregate-promotion';
import { promoteStoredItem } from '../../../composition/persistence/library-lifecycle';
import {
  parseAggregateEditorClientMessage,
  type AggregateEditorServerMessage,
} from '../../../contracts/aggregate-promotion';
import { listAggregateEditorPresence, type AggregateEditorPresence } from './presence-registry';

const EDITOR_PROMOTION_TIMEOUT_MS = 15_000;

export async function coordinateAggregatePromotion(ref: EditableAggregateRef): Promise<void> {
  const editors = listAggregateEditorPresence(ref);
  if (editors.length > 1) {
    throw new Error('This project is open in multiple editor tabs. Keep one current tab open.');
  }
  if (editors.length === 1) {
    await requestEditorPromotion(editors[0]!, ref);
    return;
  }
  await promoteStoredItem(
    ref.kind === 'image'
      ? { id: ref.id, kind: 'media' }
      : ref.kind === 'scenario'
        ? { id: ref.id, kind: 'scenario-project' }
        : { id: ref.id, kind: 'video-project' }
  );
}

function requestEditorPromotion(
  editor: AggregateEditorPresence,
  aggregate: EditableAggregateRef
): Promise<void> {
  const requestId = globalThis.crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      globalThis.clearTimeout(timeoutId);
      editor.port.onMessage.removeListener(onMessage);
      editor.port.onDisconnect.removeListener(onDisconnect);
    };
    const onMessage = (rawMessage: unknown) => {
      const message = parseAggregateEditorClientMessage(rawMessage);
      if (message?.type !== 'promotion-result' || message.requestId !== requestId) return;
      cleanup();
      if (message.success) resolve();
      else reject(new Error(message.error ?? 'The editor could not save this project.'));
    };
    const onDisconnect = () => {
      cleanup();
      reject(new Error('The editor closed before the project could be saved.'));
    };
    const timeoutId = globalThis.setTimeout(() => {
      cleanup();
      reject(new Error('The editor did not finish saving this project.'));
    }, EDITOR_PROMOTION_TIMEOUT_MS);
    editor.port.onMessage.addListener(onMessage);
    editor.port.onDisconnect.addListener(onDisconnect);
    editor.port.postMessage({
      aggregate,
      requestId,
      type: 'promote',
    } satisfies AggregateEditorServerMessage);
  });
}
