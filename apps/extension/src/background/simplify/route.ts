// policyStateId: simplify-compute-sessions - disposable caller-bound computation authority.
import { parseSimplifySettings } from '../../features/simplify/settings';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import {
  isImageEditorSenderUrl,
  isOwnedExtensionPagePath,
} from '../../platform/navigation/extension-pages/sender-url';
import {
  isSimplifyCommand,
  isSimplifyResponse,
} from '../../contracts/messaging/contracts/runtime/actions/simplify';
import {
  readSimplifyPngDimensions,
  type SimplifyCommand,
  type OffscreenSimplifyCommand,
  type SimplifyResponse,
} from '../../contracts/messaging/contracts/runtime-message/simplify.types';
import { authorizeContentSender } from '../routing-contracts/capabilities/content-action/sender-binding';

const IDLE_MS = 120_000;
const MAX_SESSIONS = 6;
const MAX_CALLER_SESSIONS = 2;
const MAX_TOTAL_PIXELS = 33_554_432;

function isContentSourceUrl(url: string | undefined): boolean {
  try {
    return !!url && ['https:', 'http:', 'file:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** Derives computation ownership from browser sender metadata, never from a payload owner field. */
export function getSimplifyCallerKey(sender: chrome.runtime.MessageSender): string | null {
  if (
    sender.id !== new URL(runtimeInfo.getURL('')).host ||
    !sender.documentId ||
    !Number.isSafeInteger(sender.frameId) ||
    sender.frameId === undefined ||
    sender.frameId < 0
  )
    return null;
  if (
    isImageEditorSenderUrl(sender.url) ||
    isOwnedExtensionPagePath(sender.url, 'apps/extension/src/web-snapshot-viewer/index.html')
  ) {
    return JSON.stringify([
      'extension',
      sender.tab?.id ?? null,
      sender.frameId,
      sender.documentId,
      sender.url,
    ]);
  }
  if (!isContentSourceUrl(sender.url)) return null;
  const decision = authorizeContentSender(sender);
  if (!decision.allowed || !isContentSourceUrl(decision.principal.senderUrl)) return null;
  return JSON.stringify([
    'content',
    decision.principal.tabId,
    decision.principal.frameId,
    decision.principal.documentId,
    decision.principal.senderUrl,
  ]);
}

type ComputationCommand = Extract<SimplifyCommand, { operation: 'prepare' | 'render' }>;

function createComputationPayload(
  command: ComputationCommand,
  sessionId: string
): OffscreenSimplifyCommand {
  if (command.operation === 'prepare')
    return { operation: 'prepare', dataUrl: command.dataUrl, sessionId };
  const settings = parseSimplifySettings(command.settings);
  if (!settings) throw new Error('Invalid simplify settings');
  return {
    operation: 'render',
    sessionId,
    settings,
    region: {
      x: command.region.x,
      y: command.region.y,
      width: command.region.width,
      height: command.region.height,
      ...(command.region.rotation === undefined ? {} : { rotation: command.region.rotation }),
    },
  };
}

function parseComputationResponse(
  response: unknown,
  command: ComputationCommand,
  sessionId: string
): SimplifyResponse {
  if (
    !isSimplifyResponse(response) ||
    response.success !== true ||
    !('sessionId' in response) ||
    response.sessionId !== sessionId ||
    (command.operation === 'render' && !response.dataUrl)
  )
    throw new Error('Simplify computation failed');
  const expected =
    command.operation === 'prepare' ? readSimplifyPngDimensions(command.dataUrl) : command.region;
  if (!expected || response.width !== expected.width || response.height !== expected.height)
    throw new Error('Simplify result dimensions do not match the request');
  return response;
}

function parseDisposalResponse(response: unknown): SimplifyResponse {
  if (
    !isSimplifyResponse(response) ||
    response.success !== true ||
    !('result' in response) ||
    response.result !== 'disposed'
  )
    throw new Error('Simplify disposal failed');
  return response;
}

interface SimplifyRouteDependencies {
  ensureDocument(): Promise<void>;
  send(command: OffscreenSimplifyCommand): Promise<unknown>;
  createId(): string;
}
/** Owns disposable caller-bound session authority and forwards only supplied image computation. */
export function createSimplifyRoute(deps: SimplifyRouteDependencies) {
  const sessions = new Map<
    string,
    { caller: string; tabId: number | null; pixels: number; timer: ReturnType<typeof setTimeout> }
  >();
  const retire = (id: string) => {
    const session = sessions.get(id);
    if (session) clearTimeout(session.timer);
    sessions.delete(id);
  };
  const disposeSession = (id: string) => {
    retire(id);
    void deps.send({ operation: 'dispose', sessionId: id }).catch(() => undefined);
  };
  const touch = (id: string) => {
    const session = sessions.get(id);
    if (!session) throw new Error('Simplify session is unavailable');
    clearTimeout(session.timer);
    session.timer = setTimeout(() => disposeSession(id), IDLE_MS);
  };
  const requireOwner = (id: string, caller: string) => {
    if (sessions.get(id)?.caller !== caller) throw new Error('Simplify session is unavailable');
  };
  return {
    async execute(
      command: SimplifyCommand,
      caller: string,
      tabId: number | null = null
    ): Promise<SimplifyResponse> {
      let sessionId: string;
      if (command.operation === 'prepare') {
        const dimensions = readSimplifyPngDimensions(command.dataUrl);
        if (!dimensions) throw new Error('Invalid simplify PNG source');
        const pixels = dimensions.width * dimensions.height;
        if (
          sessions.size >= MAX_SESSIONS ||
          [...sessions.values()].filter((entry) => entry.caller === caller).length >=
            MAX_CALLER_SESSIONS ||
          [...sessions.values()].reduce((total, entry) => total + entry.pixels, pixels) >
            MAX_TOTAL_PIXELS
        )
          throw new Error('Simplify source capacity exceeded');
        sessionId = deps.createId();
        sessions.set(sessionId, { caller, tabId, pixels, timer: setTimeout(() => undefined, 0) });
        touch(sessionId);
      } else {
        sessionId = command.sessionId;
        requireOwner(sessionId, caller);
        touch(sessionId);
      }
      if (command.operation === 'cancel' || command.operation === 'dispose') {
        retire(sessionId);
        return parseDisposalResponse(await deps.send({ operation: command.operation, sessionId }));
      }
      try {
        if (command.operation === 'prepare') await deps.ensureDocument();
        requireOwner(sessionId, caller);
        const response = await deps.send(createComputationPayload(command, sessionId));
        requireOwner(sessionId, caller);
        const accepted = parseComputationResponse(response, command, sessionId);
        touch(sessionId);
        return accepted;
      } catch (error) {
        disposeSession(sessionId);
        throw error;
      }
    },
    retireTab(tabId: number): void {
      for (const [id, session] of sessions) {
        if (session.tabId !== tabId) continue;
        disposeSession(id);
      }
    },
    dispose() {
      for (const id of sessions.keys()) {
        disposeSession(id);
      }
    },
  };
}

/** Routes an already admitted runtime request and repeats caller binding at the owner boundary. */
export function routeSimplifyMessage(
  route: ReturnType<typeof createSimplifyRoute>,
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: ResponseSender
): boolean {
  if (!isSimplifyCommand(message)) return false;
  const caller = getSimplifyCallerKey(sender);
  if (!caller) {
    sendResponse({ success: false, error: 'Unauthorized simplify sender' });
    return true;
  }
  void route
    .execute(message, caller, sender.tab?.id ?? null)
    .then(sendResponse, () =>
      sendResponse({ success: false, error: 'Simplify computation failed' })
    );
  return true;
}
