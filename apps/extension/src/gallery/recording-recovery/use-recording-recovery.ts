import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listRecoverableRecordings,
  deleteRecoveryRecording,
  prepareOriginalRecordingDownload,
  recoverRecording,
  type RecoveryRecording,
} from '../../workflows/video/recording-recovery';
import { downloadGalleryBlob } from '../shared/download';

type RecoveryAction = 'recover' | 'download' | 'delete';
type RecoveryMessage = 'loadFailed' | 'actionFailed' | 'downloadFailed' | null;
interface RecoveryState {
  entries: RecoveryRecording[];
  loading: boolean;
  busy: boolean;
  message: RecoveryMessage;
}
interface ActionFeedback {
  isMounted(): boolean;
  report(message: RecoveryMessage): void;
}

async function downloadOriginal(entry: RecoveryRecording, feedback: ActionFeedback) {
  const resource = await prepareOriginalRecordingDownload(entry);
  if (!feedback.isMounted()) {
    await resource.release();
    return false;
  }
  downloadGalleryBlob(
    resource.file,
    resource.filename,
    resource.release,
    () => feedback.report('actionFailed'),
    (state) => {
      if (state !== 'complete') feedback.report('downloadFailed');
    }
  );
  return true;
}

async function performRecoveryAction(
  entry: RecoveryRecording,
  action: RecoveryAction,
  feedback: ActionFeedback
) {
  if (action === 'download') return downloadOriginal(entry, feedback);
  if (action === 'recover') await recoverRecording(entry);
  else await deleteRecoveryRecording(entry.id, entry.incarnation);
  return true;
}

function completedRecoveryAction(
  state: RecoveryState,
  entry: RecoveryRecording,
  action: RecoveryAction
): RecoveryState {
  if (action === 'download') return state;
  return {
    ...state,
    entries: state.entries.filter(
      (item) => item.id !== entry.id || item.incarnation !== entry.incarnation
    ),
    message: null,
  };
}

export function useRecordingRecovery(disabled: boolean) {
  const [state, setState] = useState<RecoveryState>({
    entries: [],
    loading: true,
    busy: false,
    message: null,
  });
  const alive = useRef(false);
  const pending = useRef(false);
  const revision = useRef(0);
  const report = useCallback((message: RecoveryMessage) => {
    if (alive.current) setState((current) => ({ ...current, message }));
  }, []);
  const refresh = useCallback(async () => {
    const requested = ++revision.current;
    setState((current) => ({ ...current, loading: true }));
    try {
      const entries = await listRecoverableRecordings();
      if (!alive.current || requested !== revision.current) return;
      setState((current) => ({ ...current, entries, message: null }));
    } catch {
      if (alive.current && requested === revision.current) report('loadFailed');
    } finally {
      if (alive.current && requested === revision.current)
        setState((current) => ({ ...current, loading: false }));
    }
  }, [report]);
  useEffect(() => {
    const lifecycle = alive;
    const requestRevision = revision;
    lifecycle.current = true;
    void refresh();
    const onFocus = () => {
      if (!pending.current) void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      lifecycle.current = false;
      requestRevision.current++;
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const run = async (entry: RecoveryRecording, action: RecoveryAction) => {
    if (pending.current || disabled) return false;
    pending.current = true;
    revision.current++;
    setState((current) => ({ ...current, loading: false, busy: true, message: null }));
    try {
      const completed = await performRecoveryAction(entry, action, {
        isMounted: () => alive.current,
        report,
      });
      if (completed && alive.current)
        setState((current) => completedRecoveryAction(current, entry, action));
      return completed;
    } catch {
      report('actionFailed');
      return false;
    } finally {
      pending.current = false;
      if (alive.current) setState((current) => ({ ...current, busy: false }));
    }
  };
  return { ...state, refresh, run };
}
