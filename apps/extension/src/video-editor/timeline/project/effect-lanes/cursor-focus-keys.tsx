import { getVideoProjectUtilityLanes } from '../../../../features/video/project/utility-lanes';
import type { VideoProject } from '../../../../features/video/project/types';
import {
  addProjectCursorFocusKey,
  resolveProjectCursorFocusPath,
} from '../../../../features/video/project/cursor-focus-path/projection';
import {
  authoredCursorFocusPath,
  moveCursorFocusTimelineKey,
} from '../../../../features/video/project/cursor-focus-path/authoring';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import {
  useVideoEditorClipSelectionPort,
  useVideoEditorPlaybackPort,
  useVideoEditorTimelineEditingPort,
} from '../../../runtime/controller/store';
import {
  projectTimelinePoint,
  timelineViewportXToTime,
  type TimelineProjection,
} from '../interaction-state/projection';
import { useMemo, type ReactNode } from 'react';
import { CursorFocusTimelineKeys } from '../../../../ui/cursor-focus-timeline-keys';
import {
  projectCursorFocusTimelineKeys,
  type CursorFocusTimelineKey,
} from '../../../../features/video/project/cursor-focus-path/timeline';
/** Project editing and viewport projection stay with the standalone timeline owner. */
export function ProjectCursorFocusKeys(params: {
  project: VideoProject;
  children?: ReactNode;
  pixelsPerSecond: number;
  projection?: TimelineProjection;
}) {
  const selection = useVideoEditorClipSelectionPort((port) => port.selection);
  const select = useVideoEditorClipSelectionPort((port) => port.selectCursorSegment);
  const playback = useVideoEditorPlaybackPort((port) => ({
    time: port.currentTime,
    playing: port.isPlaying,
    setPlaying: port.setPlaying,
    seek: port.setCurrentTime,
  }));
  const updateProject = useVideoEditorTimelineEditingPort((port) => port.updateProject);
  const keys = useMemo(() => projectCursorFocusTimelineKeys(params.project), [params.project]);
  const props = {
    keys,
    selectedId: selection.kind === 'cursor-segment' ? selection.sampleId : undefined,
    time: playback.time,
    playing: playback.playing,
    onNavigate: (time: number, key?: CursorFocusTimelineKey) => {
      playback.setPlaying(false);
      if (key) select(key.id);
      playback.seek(time);
    },
    onMove: (key: CursorFocusTimelineKey, time: number) => {
      let result: { id: string; time: number } | undefined;
      updateProject((project) => {
        if (getVideoProjectUtilityLanes(project).actions.locked) return project;
        const clip = project.clips.find((item) => item.id === key.sourceClipId);
        const rate = clip?.type === 'VIDEO' ? (clip.playbackRate ?? 1) : 1;
        const moved = moveCursorFocusTimelineKey(
          resolveProjectCursorFocusPath(project),
          { ...key, time: key.sourceTime },
          key.sourceTime + (time - key.time) * rate
        );
        result = { id: moved.id, time: key.time + (moved.time - key.sourceTime) / rate };
        return applyVideoProjectMutationPatch(project, {
          cursorFocusPath: authoredCursorFocusPath(moved.path),
        });
      });
      if (result) {
        select(result.id);
        playback.seek(result.time);
      }
    },
    duration: params.project.duration,
    pixelsPerSecond: params.pixelsPerSecond,
    disabled: getVideoProjectUtilityLanes(params.project).actions.locked,
    onSelect: (key: CursorFocusTimelineKey) => {
      select(key.id);
      playback.seek(key.time);
    },
    onAdd: (time: number) => {
      const id = crypto.randomUUID();
      let added = false;
      updateProject((project) => {
        if (getVideoProjectUtilityLanes(project).actions.locked) return project;
        added = true;
        return applyVideoProjectMutationPatch(project, {
          cursorFocusPath: authoredCursorFocusPath(addProjectCursorFocusKey(project, time, id)),
        });
      });
      if (added) {
        select(id);
        playback.seek(time);
      }
    },
  };
  return (
    <div className="contents" data-video-editor-local-navigation="true">
      <CursorFocusTimelineKeys
        {...props}
        toX={
          params.projection ? (time) => projectTimelinePoint(params.projection!, time) : undefined
        }
        toTime={
          params.projection
            ? (offset) => timelineViewportXToTime(params.projection!, offset)
            : undefined
        }
      >
        {params.children}
      </CursorFocusTimelineKeys>
    </div>
  );
}
