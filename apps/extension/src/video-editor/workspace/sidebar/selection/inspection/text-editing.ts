import { useCallback, useEffect, useRef, useState } from 'react';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import type { VideoProjectTextDocument } from '../../../../../features/video/project/text/types';
import { applyVideoProjectTextEdit } from '../../../../../features/video/project/text/authoring';
import type { ReviewTextEditResult } from '../../../../../features/video/review/text-types';
import {
  useVideoEditorHistoryPort,
  useVideoEditorPlaybackPort,
  useVideoEditorTimelineEditingPort,
} from '../../../../runtime/controller/store';
import type { VideoEditorProjectHistoryTransactionLease } from '../../../../contracts/commands/history';

type EditReason = Extract<ReviewTextEditResult, { ok: false }>['reason'];

/** Montage adapts shared text rules to its existing mutation, history and playback owners. */
export function useProjectTextEditing(project: VideoProject) {
  const updateProject = useVideoEditorTimelineEditingPort((port) => port.updateProject);
  const history = useVideoEditorHistoryPort((port) => ({
    begin: port.beginProjectHistoryTransaction,
    end: port.endProjectHistoryTransaction,
    current: port.isProjectHistoryTransactionCurrent,
  }));
  const playback = useVideoEditorPlaybackPort((port) => ({
    time: port.currentTime,
    setPlaying: port.setPlaying,
    seek: port.setCurrentTime,
  }));
  const lease = useRef<VideoEditorProjectHistoryTransactionLease | null>(null);
  const [error, setError] = useState<EditReason | null>(null);
  const endHistoryTransaction = history.end;
  const endTyping = useCallback(() => {
    if (lease.current) endHistoryTransaction(lease.current);
    lease.current = null;
  }, [endHistoryTransaction]);
  useEffect(() => endTyping, [endTyping, project.id]);
  const beginTyping = () => {
    if (lease.current && history.current(lease.current)) return true;
    lease.current = history.begin({ onlyIfIdle: true });
    if (!lease.current) setError('stale');
    return lease.current !== null;
  };
  const accept = (
    operation: (current: VideoProject) => ReturnType<typeof applyVideoProjectTextEdit>,
    typing = false
  ) => {
    if (typing && !beginTyping()) return false;
    if (!typing) endTyping();
    let accepted = false;
    updateProject((current) => {
      const result =
        current === project ? operation(current) : { ok: false as const, reason: 'stale' as const };
      if (!result.ok) {
        setError(result.reason);
        return current;
      }
      accepted = true;
      setError(null);
      return result.project;
    });
    return accepted;
  };
  const edit = (entry: VideoProjectTextDocument, result: ReviewTextEditResult, typing = false) => {
    if (!result.ok) {
      if (!typing) endTyping();
      setError(result.reason);
      return false;
    }
    return accept(
      (current) => applyVideoProjectTextEdit(current, entry, { document: result.document }),
      typing
    );
  };
  return { error, playback, beginTyping, endTyping, accept, edit };
}

export type ProjectTextEditor = ReturnType<typeof useProjectTextEditing>;
