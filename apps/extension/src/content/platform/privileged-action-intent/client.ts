import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  ContentPrivilegedActionActivationKey,
  ContentPrivilegedActionCapability,
  ContentPrivilegedActionRequestSource,
  ContentPrivilegedActionType,
} from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import {
  isContentPrivilegedActionActivationKey,
  isContentPrivilegedActionCapability,
  isContentPrivilegedActionRuntimeToken,
  isContentPrivilegedActionTrustedEventProof,
} from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import { isTrustedDomEvent } from '../../platform/trusted-events';
import { isBridgedMouseEvent } from '../../platform/trusted-events/synthetic-mouse';
import type { ContentActionIntentSendMessage } from './types';
import { sendContentActionIntentMessage } from './transport';

type ContentActionIntentResponse = Awaited<ReturnType<ContentActionIntentSendMessage>>;

type TrustedContentEventSource = { kind: 'trusted-content-event' };

// policyStateIds: [
//   'content-action-runtime-tokens',
//   'content-action-trusted-event-proofs',
//   'content-action-capabilities',
// ]
export type ContentPrivilegedActionIntentSource =
  | ContentPrivilegedActionRequestSource
  | TrustedContentEventSource;

type ProtectedContentActionMessage = {
  contentIntent?: ContentPrivilegedActionCapability;
  type: ContentPrivilegedActionType;
};

export type ContentActionIntentClient = {
  attachContentActionIntent<TMessage extends ProtectedContentActionMessage>(
    message: TMessage,
    source: ContentPrivilegedActionIntentSource | null | undefined
  ): Promise<TMessage>;
  createBackgroundAutoStartContentActionIntentSource(
    grantToken: string
  ): ContentPrivilegedActionIntentSource;
  createTrustedContentActionIntentSource(event: Event): ContentPrivilegedActionIntentSource | null;
};

export type ContentActionIntentClientDeps = {
  now?: () => number;
  randomId?: () => string;
  sendMessage: ContentActionIntentSendMessage;
};

export function createBackgroundAutoStartContentActionIntentSource(
  grantToken: string
): ContentPrivilegedActionIntentSource {
  return { grantToken, kind: 'background-auto-start' };
}

function createDefaultRequestId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (!randomUUID) {
    throw new Error('Content action capability request id generation is unavailable.');
  }
  return randomUUID.call(globalThis.crypto);
}

class ContentActionIntentClientImpl implements ContentActionIntentClient {
  private activationKey: ContentPrivilegedActionActivationKey | null = null;
  private activationKeyPromise: Promise<ContentPrivilegedActionActivationKey> | null = null;
  private readonly now: () => number;
  private readonly randomId: () => string;
  private readonly sendMessage: ContentActionIntentSendMessage;
  private readonly trustedContentEventSources = new WeakSet<TrustedContentEventSource>();

  constructor({
    now = () => Date.now(),
    randomId = createDefaultRequestId,
    sendMessage,
  }: ContentActionIntentClientDeps) {
    this.now = now;
    this.randomId = randomId;
    this.sendMessage = sendMessage;
  }

  createTrustedContentActionIntentSource(event: Event): ContentPrivilegedActionIntentSource | null {
    if (!isTrustedDomEvent(event) && !isBridgedMouseEvent(event)) {
      return null;
    }

    const source: TrustedContentEventSource = { kind: 'trusted-content-event' };
    this.trustedContentEventSources.add(source);
    return source;
  }

  createBackgroundAutoStartContentActionIntentSource(
    grantToken: string
  ): ContentPrivilegedActionIntentSource {
    return createBackgroundAutoStartContentActionIntentSource(grantToken);
  }

  async attachContentActionIntent<TMessage extends ProtectedContentActionMessage>(
    message: TMessage,
    source: ContentPrivilegedActionIntentSource | null | undefined
  ): Promise<TMessage> {
    if (!source) {
      return message;
    }

    const requestId = this.randomId();
    const requestSource = await this.resolveContentActionRequestSource({
      actionType: message.type,
      requestId,
      source,
    });
    const contentIntent = await this.requestContentActionCapability({
      actionType: message.type,
      requestId,
      source: requestSource,
    });

    return { ...message, contentIntent };
  }

  resetForTests(): void {
    this.activationKey = null;
    this.activationKeyPromise = null;
  }

  private isActivationKeyFresh(key: ContentPrivilegedActionActivationKey): boolean {
    return key.expiresAtEpochMs > this.now();
  }

  private clearContentActionActivationKey(): void {
    this.activationKey = null;
    this.activationKeyPromise = null;
  }

  private async requestContentActionActivationKey(): Promise<ContentPrivilegedActionActivationKey> {
    const response = await sendContentActionIntentMessage(this.sendMessage, {
      purpose: 'trusted-content-event',
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
    });
    if (!response?.success || !isContentPrivilegedActionActivationKey(response.activationKey)) {
      throw new Error(response?.error || 'Content action activation key request failed');
    }
    return response.activationKey;
  }

  private async getContentActionActivationKey(): Promise<ContentPrivilegedActionActivationKey> {
    if (this.activationKey !== null && this.isActivationKeyFresh(this.activationKey)) {
      return this.activationKey;
    }
    this.activationKey = null;
    this.activationKeyPromise ??= this.requestContentActionActivationKey()
      .then((key) => {
        this.activationKey = key;
        this.activationKeyPromise = null;
        return key;
      })
      .catch((error: unknown) => {
        this.activationKeyPromise = null;
        throw error;
      });
    return this.activationKeyPromise;
  }

  private async requestContentActionRuntimeTokenWithKey(args: {
    actionType: ContentPrivilegedActionType;
    key: ContentPrivilegedActionActivationKey;
    requestId: string;
  }): Promise<ContentActionIntentResponse> {
    return sendContentActionIntentMessage(this.sendMessage, {
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
      activationProof: args.key,
      actionType: args.actionType,
      requestId: args.requestId,
    });
  }

  private async requestContentActionRuntimeToken(args: {
    actionType: ContentPrivilegedActionType;
    requestId: string;
  }): Promise<string> {
    const key = await this.getContentActionActivationKey();
    const response = await this.requestContentActionRuntimeTokenWithKey({ ...args, key });
    if (response?.success && isContentPrivilegedActionRuntimeToken(response.runtimeToken)) {
      this.clearContentActionActivationKey();
      return response.runtimeToken.runtimeToken;
    }
    if (response?.error === 'Unauthorized content action activation proof') {
      this.clearContentActionActivationKey();
      const refreshedKey = await this.getContentActionActivationKey();
      const refreshedResponse = await this.requestContentActionRuntimeTokenWithKey({
        ...args,
        key: refreshedKey,
      });
      if (
        refreshedResponse?.success &&
        isContentPrivilegedActionRuntimeToken(refreshedResponse.runtimeToken)
      ) {
        this.clearContentActionActivationKey();
        return refreshedResponse.runtimeToken.runtimeToken;
      }
      throw new Error(refreshedResponse?.error || 'Content action runtime token request failed');
    }
    throw new Error(response?.error || 'Content action runtime token request failed');
  }

  private async requestContentActionTrustedEventProof(args: {
    actionType: ContentPrivilegedActionType;
    requestId: string;
  }): Promise<{ kind: 'trusted-content-event-proof'; proofToken: string }> {
    const runtimeToken = await this.requestContentActionRuntimeToken({
      actionType: args.actionType,
      requestId: args.requestId,
    });
    const response = await sendContentActionIntentMessage(this.sendMessage, {
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
      actionType: args.actionType,
      requestId: args.requestId,
      runtimeToken,
    });

    if (
      !response?.success ||
      !isContentPrivilegedActionTrustedEventProof(response.trustedEventProof)
    ) {
      throw new Error(response?.error || 'Content action trusted-event proof request failed');
    }

    return {
      kind: 'trusted-content-event-proof',
      proofToken: response.trustedEventProof.proofToken,
    };
  }

  private async resolveContentActionRequestSource(args: {
    actionType: ContentPrivilegedActionType;
    requestId: string;
    source: ContentPrivilegedActionIntentSource;
  }): Promise<ContentPrivilegedActionRequestSource> {
    if (args.source.kind !== 'trusted-content-event') {
      return args.source;
    }
    if (!this.trustedContentEventSources.has(args.source)) {
      throw new Error('Content action trusted-event source is not owner-issued.');
    }

    return this.requestContentActionTrustedEventProof({
      actionType: args.actionType,
      requestId: args.requestId,
    });
  }

  private async requestContentActionCapability(args: {
    actionType: ContentPrivilegedActionType;
    requestId: string;
    source: ContentPrivilegedActionRequestSource;
  }): Promise<ContentPrivilegedActionCapability> {
    const response = await sendContentActionIntentMessage(this.sendMessage, {
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
      actionType: args.actionType,
      requestId: args.requestId,
      source: args.source,
    });

    if (!response?.success || !isContentPrivilegedActionCapability(response.contentIntent)) {
      throw new Error(response?.error || 'Content action capability request failed');
    }

    return response.contentIntent;
  }
}

export function createContentActionIntentClient(
  deps: ContentActionIntentClientDeps
): ContentActionIntentClient {
  return new ContentActionIntentClientImpl(deps);
}
