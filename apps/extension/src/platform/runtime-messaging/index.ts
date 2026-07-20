// Sanctioned shared runtime-messaging transport owner.
// This root owns typed runtime/tab messaging; keep unrelated contracts and broad re-exports out.
export type {} from '@sniptale/runtime-contracts/messaging/contracts/response';

export { createRuntimeMessagingTransport } from './chrome-transport';
export { sendRuntimeMessage, sendTabMessage } from './default-transport';
export type { RuntimeMessagingDeps, RuntimeMessagingTransport } from './transport';

export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  return error instanceof Error ? error.message : fallback;
}
