import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { startRecording } from '../../manager';
import type {
  cancelRecordingStart,
  pauseRecording,
  resumeRecording,
  stopRecording,
  updateRecordingSettings,
} from './controls';

type InactiveRecordingFailureResponse =
  | { result: 'failed'; error: string }
  | { result: 'already-stopping' | 'blocked' | 'no-active-recording' };

type AcceptedOrInactiveRecordingResponse =
  | Awaited<ReturnType<typeof cancelRecordingStart>>
  | Awaited<ReturnType<typeof stopRecording>>
  | Awaited<ReturnType<typeof pauseRecording>>
  | Awaited<ReturnType<typeof updateRecordingSettings>>;

export function sendStartRecordingResponse(
  response: Awaited<ReturnType<typeof startRecording>>,
  sendResponse: ResponseSender
): void {
  if (response.result === 'failed') {
    sendResponse({ success: false, error: response.error, result: response.result });
    return;
  }

  sendResponse({ success: true, ...response });
}

export function sendAcceptedOrInactiveRecordingResponse(
  response: AcceptedOrInactiveRecordingResponse,
  sendResponse: ResponseSender
): void {
  if (response.result === 'failed' || response.result === 'no-active-recording') {
    sendInactiveRecordingFailure(response, sendResponse);
    return;
  }

  sendResponse({ success: true, ...response });
}

function sendInactiveRecordingFailure(
  response: InactiveRecordingFailureResponse,
  sendResponse: ResponseSender
): void {
  sendResponse({
    success: false,
    error: response.result === 'failed' ? response.error : 'No active recording',
    result: response.result,
  });
}

export function sendResumeRecordingResponse(
  response: Awaited<ReturnType<typeof resumeRecording>>,
  sendResponse: ResponseSender
): void {
  if (
    response.result === 'failed' ||
    response.result === 'no-active-recording' ||
    response.result === 'blocked'
  ) {
    sendResponse({
      success: false,
      error: resolveResumeError(response),
      result: response.result,
    });
    return;
  }

  sendResponse({ success: true, ...response });
}

function resolveResumeError(response: Awaited<ReturnType<typeof resumeRecording>>): string {
  if (response.result === 'failed') {
    return response.error;
  }
  return response.result === 'blocked' ? 'Resume is blocked' : 'No active recording';
}
