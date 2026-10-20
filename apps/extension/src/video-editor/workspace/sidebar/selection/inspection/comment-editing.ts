import { useCallback, useEffect, useRef, useState } from 'react';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import type { VideoProjectCommentDocument } from '../../../../../features/video/project/comments/types';
import type { VideoEditorAnnotationActions } from '../../../../contracts/commands/annotation';
import type { VideoEditorProjectHistoryTransactionLease } from '../../../../contracts/commands/history';
import {
  useVideoEditorAnnotationEditingPort,
  useVideoEditorClipSelectionPort,
  useVideoEditorHistoryPort,
  useVideoEditorPlaybackPort,
} from '../../../../runtime/controller/store';

/** Commands and history leases remain with the existing Native project owner. */
export function useProjectCommentEditing(project: VideoProject) {
  const commands = useVideoEditorAnnotationEditingPort((port) => ({
    add: port.addCommentDocument,
    edit: port.editCommentDocument,
  }));
  const selection = useVideoEditorClipSelectionPort((port) => ({
    select: port.selectComment,
    back: port.selectScene,
  }));
  const history = useVideoEditorHistoryPort((port) => ({
    begin: port.beginProjectHistoryTransaction,
    end: port.endProjectHistoryTransaction,
    current: port.isProjectHistoryTransactionCurrent,
  }));
  const playback = useVideoEditorPlaybackPort((port) => ({
    time: port.currentTime,
    pause: port.setPlaying,
  }));
  const lease = useRef<VideoEditorProjectHistoryTransactionLease | null>(null);
  const [refused, setRefused] = useState(false);
  const end = history.end;
  const isHistoryCurrent = history.current;
  const endTyping = useCallback(() => {
    if (lease.current) end(lease.current);
    lease.current = null;
  }, [end]);
  useEffect(() => endTyping, [endTyping, project.id]);
  useEffect(() => {
    if (lease.current && !isHistoryCurrent(lease.current)) lease.current = null;
  }, [project, isHistoryCurrent]);
  const edit = (
    document: VideoProjectCommentDocument,
    operation: Parameters<VideoEditorAnnotationActions['editCommentDocument']>[2],
    typing = false
  ) => {
    if (typing) {
      if (!lease.current) lease.current = history.begin({ onlyIfIdle: true });
      if (!lease.current || !isHistoryCurrent(lease.current)) {
        setRefused(true);
        return false;
      }
    } else endTyping();
    playback.pause(false);
    const accepted = commands.edit(project, document.id, operation);
    setRefused(!accepted);
    if (!accepted) endTyping();
    return accepted;
  };
  const add = (input: Parameters<VideoEditorAnnotationActions['addCommentDocument']>[1]) => {
    endTyping();
    playback.pause(false);
    const id = commands.add(project, input);
    setRefused(!id);
    return id;
  };
  return { edit, add, selection, time: playback.time, refused, endTyping };
}
