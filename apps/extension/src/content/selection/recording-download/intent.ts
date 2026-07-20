import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  isContentPrivilegedActionActivationKey,
  isContentPrivilegedActionCapability,
  isContentPrivilegedActionRuntimeToken,
  isContentPrivilegedActionTrustedEventProof,
  type ContentPrivilegedActionActivationKey,
  type ContentPrivilegedActionCapability,
} from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import { createRecordingDownloadRandomId } from './random-id';

export type RuntimeSuccessResponse = {
  contentIntent?: unknown;
  activationKey?: unknown;
  error?: string | undefined;
  runtimeToken?: unknown;
  success?: boolean;
  trustedEventProof?: unknown;
};

type RecordingDownloadActionType =
  | typeof MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK
  | typeof MessageType.SAVE_RECORDING_FOR_DOWNLOAD
  | typeof MessageType.RELEASE_RECORDING_DOWNLOAD;

export type RecordingDownloadIntentMessage =
  | {
      purpose: 'recording-download';
      type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY;
    }
  | {
      activationProof: ContentPrivilegedActionActivationKey;
      actionType: RecordingDownloadActionType;
      requestId: string;
      type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN;
    }
  | {
      actionType: RecordingDownloadActionType;
      requestId: string;
      runtimeToken: string;
      type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF;
    }
  | {
      actionType: RecordingDownloadActionType;
      requestId: string;
      source: { kind: 'trusted-content-event-proof'; proofToken: string };
      type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY;
    };

type RecordingDownloadIntentSendMessage = (
  message: RecordingDownloadIntentMessage
) => Promise<RuntimeSuccessResponse>;

let recordingActivationKey: ContentPrivilegedActionActivationKey | null = null;
let recordingActivationKeyPromise: Promise<ContentPrivilegedActionActivationKey> | null = null;

export function assertRuntimeSuccess(response: RuntimeSuccessResponse, fallback: string): void {
  if (!response?.success) {
    throw new Error(response?.error || fallback);
  }
}

export function resetRecordingDownloadIntentForTests(): void {
  recordingActivationKey = null;
  recordingActivationKeyPromise = null;
}

function isRecordingActivationKeyFresh(key: ContentPrivilegedActionActivationKey): boolean {
  return key.expiresAtEpochMs > Date.now();
}

function clearRecordingActivationKey(): void {
  recordingActivationKey = null;
  recordingActivationKeyPromise = null;
}

function createRecordingContentIntentRequestId(actionType: RecordingDownloadActionType): string {
  return `${actionType}-${createRecordingDownloadRandomId()}`;
}

async function requestRecordingDownloadActivationKey(
  sendMessage: RecordingDownloadIntentSendMessage
): Promise<ContentPrivilegedActionActivationKey> {
  if (recordingActivationKey !== null && isRecordingActivationKeyFresh(recordingActivationKey)) {
    return recordingActivationKey;
  }
  recordingActivationKey = null;
  recordingActivationKeyPromise ??= requestFreshRecordingDownloadActivationKey(sendMessage)
    .then((key) => {
      recordingActivationKey = key;
      recordingActivationKeyPromise = null;
      return key;
    })
    .catch((error: unknown) => {
      recordingActivationKeyPromise = null;
      throw error;
    });
  return recordingActivationKeyPromise;
}

async function requestFreshRecordingDownloadActivationKey(
  sendMessage: RecordingDownloadIntentSendMessage
): Promise<ContentPrivilegedActionActivationKey> {
  const response = await sendMessage({
    purpose: 'recording-download',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
  });
  assertRuntimeSuccess(response, 'Recording download activation key request failed');
  if (!isContentPrivilegedActionActivationKey(response.activationKey)) {
    throw new Error('Recording download activation key response is missing');
  }
  return response.activationKey;
}

export async function requestRecordingDownloadContentIntent(args: {
  actionType: RecordingDownloadActionType;
  sendMessage: RecordingDownloadIntentSendMessage;
}): Promise<ContentPrivilegedActionCapability> {
  const requestId = createRecordingContentIntentRequestId(args.actionType);
  const activationProof = await requestRecordingDownloadActivationKey(args.sendMessage);
  const runtimeTokenResponse = await requestRecordingRuntimeTokenWithActivation({
    actionType: args.actionType,
    activationProof,
    requestId,
    sendMessage: args.sendMessage,
  });
  assertRuntimeSuccess(runtimeTokenResponse, 'Recording download runtime token request failed');
  if (!isContentPrivilegedActionRuntimeToken(runtimeTokenResponse.runtimeToken)) {
    throw new Error('Recording download runtime token response is missing');
  }

  const proofResponse = await args.sendMessage({
    actionType: args.actionType,
    requestId,
    runtimeToken: runtimeTokenResponse.runtimeToken.runtimeToken,
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
  });
  assertRuntimeSuccess(proofResponse, 'Recording download proof request failed');
  if (!isContentPrivilegedActionTrustedEventProof(proofResponse.trustedEventProof)) {
    throw new Error('Recording download proof response is missing');
  }

  const response = await args.sendMessage({
    actionType: args.actionType,
    requestId,
    source: {
      kind: 'trusted-content-event-proof',
      proofToken: proofResponse.trustedEventProof.proofToken,
    },
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  });
  assertRuntimeSuccess(response, 'Recording download capability request failed');
  if (!isContentPrivilegedActionCapability(response.contentIntent)) {
    throw new Error('Recording download capability response is missing');
  }
  return response.contentIntent;
}

async function requestRecordingRuntimeTokenWithActivation(args: {
  actionType: RecordingDownloadActionType;
  activationProof: ContentPrivilegedActionActivationKey;
  requestId: string;
  sendMessage: RecordingDownloadIntentSendMessage;
}): Promise<RuntimeSuccessResponse> {
  const response = await args.sendMessage({
    activationProof: args.activationProof,
    actionType: args.actionType,
    requestId: args.requestId,
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
  });
  if (response?.error !== 'Unauthorized content action activation proof') {
    return response;
  }

  clearRecordingActivationKey();
  const refreshedActivationProof = await requestRecordingDownloadActivationKey(args.sendMessage);
  return args.sendMessage({
    activationProof: refreshedActivationProof,
    actionType: args.actionType,
    requestId: args.requestId,
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
  });
}
