// policyStateId: video-capture-surface-sessions - per-tab cursor projection authority fences.
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { ViewportCursorProjectionAuthority } from '@sniptale/runtime-contracts/video/types/messages.content';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';

const commandTailByTab = new Map<number, Promise<void>>();
const retiredAuthorityIdsByTab = new Map<number, Set<string>>();

function getAuthorityId(authority: ViewportCursorProjectionAuthority): string {
  return JSON.stringify([authority.recordingId, authority.generation]);
}

function enqueueProjectionCommand(tabId: number, run: () => Promise<void>): Promise<void> {
  const previous = commandTailByTab.get(tabId) ?? Promise.resolve();
  const command = previous.then(run, run);
  const settled = command.then(
    () => undefined,
    () => undefined
  );
  commandTailByTab.set(tabId, settled);
  void settled.then(() => {
    if (commandTailByTab.get(tabId) === settled) commandTailByTab.delete(tabId);
  });
  return command;
}

function retireAuthority(tabId: number, authority: ViewportCursorProjectionAuthority): void {
  const retired = retiredAuthorityIdsByTab.get(tabId) ?? new Set<string>();
  retired.add(getAuthorityId(authority));
  retiredAuthorityIdsByTab.set(tabId, retired);
}

export function retireViewportCursorProjectionAuthority(
  tabId: number,
  authority: ViewportCursorProjectionAuthority
): void {
  retireAuthority(tabId, authority);
}

function isAuthorityRetired(tabId: number, authority: ViewportCursorProjectionAuthority): boolean {
  return retiredAuthorityIdsByTab.get(tabId)?.has(getAuthorityId(authority)) === true;
}

function requireAcknowledgement(
  response: { error?: string | undefined; success?: boolean } | null | undefined,
  operation: 'enable' | 'disable'
): void {
  if (response?.success === true) return;
  throw new Error(
    response?.error ??
      `Viewport cursor projection could not be ${operation === 'enable' ? 'enabled' : 'disabled'}`
  );
}

export function enableViewportCursorProjection(
  tabId: number,
  authority: ViewportCursorProjectionAuthority
): Promise<void> {
  return enqueueProjectionCommand(tabId, async () => {
    if (isAuthorityRetired(tabId, authority)) {
      throw new Error('Viewport cursor projection authority is retired');
    }
    const response = await getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
      ...authority,
      type: VideoMessageType.ENABLE_VIEWPORT_CURSOR_PROJECTION,
    });
    requireAcknowledgement(response, 'enable');
  });
}

export function disableViewportCursorProjection(
  tabId: number,
  authority: ViewportCursorProjectionAuthority
): Promise<void> {
  retireViewportCursorProjectionAuthority(tabId, authority);
  return enqueueProjectionCommand(tabId, async () => {
    const response = await getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
      ...authority,
      type: VideoMessageType.DISABLE_VIEWPORT_CURSOR_PROJECTION,
    });
    requireAcknowledgement(response, 'disable');
  });
}
