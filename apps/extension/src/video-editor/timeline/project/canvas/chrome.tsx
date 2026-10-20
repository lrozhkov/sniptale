import { formatPreciseTime } from '../interaction-state/helpers';
import { MessageSquare } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import type { VideoProject } from '../../../../features/video/project/types/model';
import { projectVideoProjectCommentAnchor } from '../../../../features/video/project/comments/projection';
import { projectTimelineInterval, projectTimelinePoint } from '../interaction-state/projection';
import type { VideoEditorSelection } from '../../../contracts/selection';
import type { TimelineProjection } from '../interaction-state/projection';
import { ProjectTimelinePlaybackRangeOverlay, ProjectTimelineRuler } from './parts/index';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';
import type { buildProjectTimelineRulerMarkers } from './render-data';

type ProjectTimelineRulerMarker = ReturnType<typeof buildProjectTimelineRulerMarkers>[number];

export function ProjectTimelineCanvasChrome(props: {
  playheadHandle: React.ReactNode;
  project?: VideoProject | undefined;
  selection?: VideoEditorSelection | undefined;
  onSelectComment?:
    | ((documentId: string, commentId: string, projectTime?: number) => void)
    | undefined;
  playbackRange: VideoEditorPlaybackRange | null;
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
  rulerMarkers: ProjectTimelineRulerMarker[];
  onBeginRangeSelection: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <>
      <ProjectTimelineRuler
        onBeginRangeSelection={props.onBeginRangeSelection}
        playbackRange={props.playbackRange}
        pixelsPerSecond={props.pixelsPerSecond}
        projection={props.projection}
        rulerMarkers={props.rulerMarkers}
      >
        {props.playheadHandle}
        {props.project && props.onSelectComment && (
          <ProjectTimelineNoteMarkers
            project={props.project}
            selection={props.selection}
            projection={props.projection}
            pixelsPerSecond={props.pixelsPerSecond}
            onSelect={props.onSelectComment}
          />
        )}
      </ProjectTimelineRuler>
      <ProjectTimelinePlaybackRangeOverlay
        pixelsPerSecond={props.pixelsPerSecond}
        projection={props.projection}
        playbackRange={props.playbackRange}
      />
    </>
  );
}

/** Editorial note markers share the ruler clock and never enter the video canvas. */
function ProjectTimelineNoteMarkers(props: {
  project: VideoProject;
  selection: VideoEditorSelection | undefined;
  projection: TimelineProjection | undefined;
  pixelsPerSecond: number;
  onSelect(documentId: string, commentId: string, projectTime: number): void;
}) {
  const groups = new Map<
    string,
    { start: number; end: number; notes: { documentId: string; id: string; text: string }[] }
  >();
  for (const document of props.project.commentDocuments ?? []) {
    for (const note of document.annotations) {
      for (const span of projectVideoProjectCommentAnchor(props.project, document, note.anchor)) {
        const start = Math.max(0, span.start);
        const end = Math.min(props.project.duration, span.end);
        if (end < start || start > props.project.duration) continue;
        const key = `${start}:${end}`;
        let group = groups.get(key);
        if (!group) {
          group = { start, end, notes: [] };
          groups.set(key, group);
        }
        if (!group.notes.some((item) => item.documentId === document.id && item.id === note.id))
          group.notes.push({ documentId: document.id, id: note.id, text: note.text });
      }
    }
  }
  return [...groups.entries()].map(([key, group]) => {
    const geometry = noteMarkerGeometry(
      props.projection,
      props.pixelsPerSecond,
      group.start,
      group.end,
      group.notes.length > 1 ? 20 + String(group.notes.length).length * 6 : 16
    );
    if (!geometry) return null;
    const first = group.notes[0]!;
    const selection = props.selection;
    const selected =
      selection?.kind === 'comment' &&
      group.notes.some(
        (note) => note.documentId === selection.documentId && note.id === selection.commentId
      );
    const caption = group.notes
      .map((note) => note.text || translate('videoEditor.sidebar.commentNote'))
      .join(' · ');
    return (
      <button
        key={key}
        type="button"
        data-ui="video-editor.timeline.note-marker"
        data-note-count={group.notes.length}
        aria-label={`${translate('videoEditor.sidebar.commentNote')} · ${formatPreciseTime(group.start)} · ${caption}`}
        aria-pressed={selected}
        title={caption}
        className="absolute top-0.5 z-20 flex h-4 min-w-4 items-center justify-center gap-0.5
          overflow-hidden rounded border border-[var(--sniptale-color-border-accent-strong)]
          bg-[var(--sniptale-color-surface-canvas)] px-0.5 text-[10px]
          text-[var(--sniptale-color-accent-emphasis)]
          hover:bg-[var(--sniptale-color-surface-hover)]
          aria-pressed:bg-[var(--sniptale-color-accent-soft)]"
        style={{ left: geometry.left, width: geometry.width }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          props.onSelect(first.documentId, first.id, group.start);
        }}
      >
        <MessageSquare size={11} className="shrink-0" aria-hidden="true" />
        {group.notes.length > 1 && <span>{group.notes.length}</span>}
      </button>
    );
  });
}

function noteMarkerGeometry(
  projection: TimelineProjection | undefined,
  pixelsPerSecond: number,
  start: number,
  end: number,
  minimumWidth: number
) {
  if (!projection)
    return {
      left: start * pixelsPerSecond,
      width: Math.max(minimumWidth, (end - start) * pixelsPerSecond),
    };
  if (end > start) {
    const interval = projectTimelineInterval(projection, start, end);
    return interval ? { ...interval, width: Math.max(minimumWidth, interval.width) } : null;
  }
  const point = projectTimelinePoint(projection, start);
  if (point === null || point < 0 || point > projection.viewportWidth) return null;
  return {
    left: Math.max(0, Math.min(point - minimumWidth / 2, projection.viewportWidth - minimumWidth)),
    width: minimumWidth,
  };
}
