import { useEffect, useRef, useState } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { browserDownloads } from '@sniptale/platform/browser/downloads';

const logger = createLogger({ namespace: 'AudioRecordingDownload' });

/** Download the captured bytes independently of trimming, project attachment and dialog lifetime. */
export async function downloadRecordedTake(take: Blob): Promise<void> {
  const mime = take.type.split(';')[0];
  const extension =
    mime === 'audio/mp4'
      ? 'm4a'
      : mime === 'audio/ogg'
        ? 'ogg'
        : mime === 'audio/webm'
          ? 'webm'
          : 'bin';
  const filename = `audio-${Date.now()}.${extension}`;
  const url = URL.createObjectURL(take);
  const available = browserDownloads.isAvailable();
  let unsubscribe: () => void = () => undefined;
  let unsubscribeCreated: () => void = () => undefined;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timeout);
    unsubscribe();
    unsubscribeCreated();
    URL.revokeObjectURL(url);
  };
  const timeout = setTimeout(release, available ? 24 * 60 * 60 * 1000 : 60_000);
  try {
    if (available) {
      unsubscribeCreated = browserDownloads.subscribeToCreated((item) => {
        if (item.url !== url && item.finalUrl !== url) return;
        unsubscribeCreated();
        unsubscribe = browserDownloads.subscribeToChanged((delta) => {
          if (delta.id !== item.id) return;
          if (delta.state?.current === 'complete' || delta.state?.current === 'interrupted')
            release();
        });
        void browserDownloads
          .search({ id: item.id })
          .then(([current]) => {
            if (current?.state === 'complete' || current?.state === 'interrupted') release();
          })
          .catch(() => undefined);
      });
    }
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  } catch (error) {
    release();
    throw error;
  }
}

/** Own the download intent, independently of the capture and project-save sessions. */
export function useRecordingTakeDownload(props: {
  isOpen: boolean;
  take: Blob | null;
  isBlocked(): boolean;
  onError(): void;
  download(take: Blob): Promise<void>;
}) {
  const intent = useRef<{ active: boolean; pending: boolean } | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  useEffect(() => {
    const owner = { active: props.isOpen, pending: false };
    intent.current = owner;
    setIsDownloading(false);
    return () => {
      owner.active = false;
    };
  }, [props.isOpen, props.take]);
  const reset = () => {
    if (intent.current) intent.current.active = false;
    setIsDownloading(false);
  };
  const downloadTake = async () => {
    const owner = intent.current;
    if (!owner?.active || !props.take || owner.pending || props.isBlocked()) return;
    const current = () => owner.active && intent.current === owner;
    owner.pending = true;
    setIsDownloading(true);
    try {
      await props.download(props.take);
    } catch {
      logger.error('recording_download_failed');
      if (current()) props.onError();
    } finally {
      if (current()) {
        owner.pending = false;
        setIsDownloading(false);
      }
    }
  };
  return { isDownloading, downloadTake, reset };
}
