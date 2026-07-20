import { useEffect, type MutableRefObject } from 'react';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { parsePopupRuntimeMessage } from '../../../../contracts/messaging/parsers/boundary';
import { getRecording } from '../../../../composition/persistence/recordings/index';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { resolveExtensionDocumentSenderUrl } from '../../../../platform/runtime-messaging/document-sender';

export function useSavedRecordingMessageEffect({
  lastActiveRecordingIdRef,
  setIsCancellingStart,
  setIsDiscardingRecording,
  setPostRecordRecordingId,
  shouldShowPostRecordRef,
}: {
  lastActiveRecordingIdRef: MutableRefObject<string | null>;
  setIsCancellingStart: (value: boolean) => void;
  setIsDiscardingRecording: (value: boolean) => void;
  setPostRecordRecordingId: (value: string | null) => void;
  shouldShowPostRecordRef: MutableRefObject<boolean>;
}) {
  useEffect(() => {
    let disposed = false;
    const unsubscribe = browserRuntime.subscribeToMessages((message, sender) => {
      const savedRecordingId = parseTrustedSavedRecordingId(message, sender);
      if (
        !savedRecordingId ||
        !shouldShowPostRecordRef.current ||
        lastActiveRecordingIdRef.current !== savedRecordingId
      ) {
        return;
      }

      void verifyAndShowSavedRecording({
        disposed: () => disposed,
        lastActiveRecordingIdRef,
        recordingId: savedRecordingId,
        setIsCancellingStart,
        setIsDiscardingRecording,
        setPostRecordRecordingId,
        shouldShowPostRecordRef,
      });
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [
    lastActiveRecordingIdRef,
    setIsCancellingStart,
    setIsDiscardingRecording,
    setPostRecordRecordingId,
    shouldShowPostRecordRef,
  ]);
}

async function verifyAndShowSavedRecording({
  disposed,
  lastActiveRecordingIdRef,
  recordingId,
  setIsCancellingStart,
  setIsDiscardingRecording,
  setPostRecordRecordingId,
  shouldShowPostRecordRef,
}: {
  disposed: () => boolean;
  lastActiveRecordingIdRef: MutableRefObject<string | null>;
  recordingId: string;
  setIsCancellingStart: (value: boolean) => void;
  setIsDiscardingRecording: (value: boolean) => void;
  setPostRecordRecordingId: (value: string | null) => void;
  shouldShowPostRecordRef: MutableRefObject<boolean>;
}) {
  if (
    !(await getRecording(recordingId)) ||
    disposed() ||
    !shouldShowPostRecordRef.current ||
    lastActiveRecordingIdRef.current !== recordingId
  ) {
    return;
  }

  shouldShowPostRecordRef.current = false;
  setIsCancellingStart(false);
  setIsDiscardingRecording(false);
  setPostRecordRecordingId(recordingId);
}

function parseTrustedSavedRecordingId(
  message: unknown,
  sender: chrome.runtime.MessageSender | undefined
): string | null {
  if (!isTrustedSavedRecordingSender(sender)) {
    return null;
  }

  try {
    const parsed = parsePopupRuntimeMessage(message);
    return parsed.type === VideoMessageType.VIDEO_SAVED_TO_IDB ? parsed.recordingId : null;
  } catch {
    return null;
  }
}

function isTrustedSavedRecordingSender(sender: chrome.runtime.MessageSender | undefined): boolean {
  return (
    resolveExtensionDocumentSenderUrl(sender, 'apps/extension/src/offscreen/offscreen.html') !==
    null
  );
}
