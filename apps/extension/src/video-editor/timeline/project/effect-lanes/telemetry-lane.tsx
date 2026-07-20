import { Keyboard, MousePointerClick } from 'lucide-react';
import { useMemo } from 'react';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import { translate } from '../../../../platform/i18n';
import type { VideoProject } from '../../../../features/video/project/types';
import { buildTimelineTelemetryLaneData } from '../../../project/operations/telemetry-lane';
import { TELEMETRY_LANE_ROW_HEIGHT } from '../interaction-state/helpers';
import { TIMELINE_OBJECT_MARKER_PROPS } from '../canvas/hover-preview';
import { getTelemetryLaneIcon, TimelineLaneIconFrame } from '../tracks/lane-icons';

const TELEMETRY_ROW_CLASS_NAME = [
  'relative border-b border-[var(--sniptale-color-border-subtle)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-overlay)_86%,transparent)]',
].join(' ');

const TELEMETRY_LABEL_ROW_CLASS_NAME = [
  'flex items-center gap-2.5 border-b px-3',
  'border-[var(--sniptale-color-border-subtle)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-overlay)_94%,transparent)]',
].join(' ');

const TELEMETRY_EMPTY_LABEL_CLASS_NAME = [
  'pointer-events-none absolute left-3 right-3 top-1/2 -translate-y-1/2 truncate text-xs',
  'text-[var(--sniptale-color-text-dim)]',
].join(' ');

function getTelemetrySpanClassName(kind: 'stable' | 'typing'): string {
  if (kind === 'typing') {
    return [
      'border-[color:color-mix(in_srgb,var(--sniptale-color-info)_22%,var(--sniptale-color-border-soft)_78%)]',
      'bg-[linear-gradient(135deg,',
      'color-mix(in_srgb,var(--sniptale-color-info)_14%,transparent),',
      'color-mix(in_srgb,var(--sniptale-color-surface-canvas)_78%,transparent))]',
    ].join(' ');
  }

  return [
    'border-[color:color-mix(in_srgb,var(--sniptale-color-warning)_18%,var(--sniptale-color-border-soft)_82%)]',
    'bg-[linear-gradient(135deg,',
    'color-mix(in_srgb,var(--sniptale-color-warning-soft)_18%,transparent),',
    'color-mix(in_srgb,var(--sniptale-color-surface-canvas)_82%,transparent))]',
  ].join(' ');
}

function getTelemetryMarkerClassName(kind: 'click' | 'key'): string {
  if (kind === 'key') {
    return [
      'border-[color:color-mix(in_srgb,var(--sniptale-color-warning)_28%,var(--sniptale-color-border-soft)_72%)]',
      'bg-[color:color-mix(in_srgb,var(--sniptale-color-warning-soft)_74%,transparent)]',
    ].join(' ');
  }

  return [
    'border-[color:color-mix(in_srgb,var(--sniptale-color-info)_24%,var(--sniptale-color-border-soft)_76%)]',
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-info)_18%,transparent)]',
  ].join(' ');
}

export function ProjectTimelineTelemetryLaneLabelRow({ compactRows }: { compactRows: boolean }) {
  return (
    <div
      className={
        compactRows
          ? 'flex items-center justify-center border-b border-[var(--sniptale-color-border-subtle)]'
          : TELEMETRY_LABEL_ROW_CLASS_NAME
      }
      style={{ height: TELEMETRY_LANE_ROW_HEIGHT }}
    >
      <TimelineLaneIconFrame>{getTelemetryLaneIcon()}</TimelineLaneIconFrame>
      {compactRows ? null : (
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-[var(--sniptale-color-text-primary)]">
            {translate('videoEditor.timeline.telemetryLane')}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectTimelineTelemetryMarker(props: {
  kind: 'click' | 'key';
  label: string;
  left: number;
}) {
  const Icon = props.kind === 'key' ? Keyboard : MousePointerClick;

  return (
    <div
      {...TIMELINE_OBJECT_MARKER_PROPS}
      title={props.label}
      className={[
        [
          'absolute top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2',
          'items-center justify-center rounded-full border',
        ].join(' '),
        getTelemetryMarkerClassName(props.kind),
      ].join(' ')}
      style={{ left: props.left }}
    >
      <Icon className="h-3.5 w-3.5 text-[var(--sniptale-color-text-secondary)]" />
    </div>
  );
}

function ProjectTimelineTelemetrySpan(props: {
  endTime: number;
  kind: 'stable' | 'typing';
  pixelsPerSecond: number;
  startTime: number;
}) {
  return (
    <div
      {...TIMELINE_OBJECT_MARKER_PROPS}
      className={[
        'absolute top-1/2 h-8 -translate-y-1/2 rounded-[12px] border',
        getTelemetrySpanClassName(props.kind),
      ].join(' ')}
      style={{
        left: props.startTime * props.pixelsPerSecond,
        width: Math.max(16, (props.endTime - props.startTime) * props.pixelsPerSecond),
      }}
    />
  );
}

export function ProjectTimelineTelemetryLane(props: {
  pixelsPerSecond: number;
  project: VideoProject;
  recordingTelemetry: RecordingTelemetryEntry | null;
}) {
  const laneData = useMemo(() => {
    const recordingId = props.project.baseRecordingId;
    if (!recordingId || !props.recordingTelemetry) {
      return null;
    }

    return buildTimelineTelemetryLaneData(props.project, recordingId, props.recordingTelemetry);
  }, [props.project, props.recordingTelemetry]);

  const hasSegments = (laneData?.markers.length ?? 0) > 0 || (laneData?.spans.length ?? 0) > 0;

  return (
    <div className={TELEMETRY_ROW_CLASS_NAME} style={{ height: TELEMETRY_LANE_ROW_HEIGHT }}>
      {!hasSegments ? (
        <span className={TELEMETRY_EMPTY_LABEL_CLASS_NAME}>
          {translate('videoEditor.timeline.telemetryLaneEmpty')}
        </span>
      ) : null}
      {laneData?.spans.map((span) => (
        <ProjectTimelineTelemetrySpan
          key={span.id}
          endTime={span.endTime}
          kind={span.kind}
          pixelsPerSecond={props.pixelsPerSecond}
          startTime={span.startTime}
        />
      ))}
      {laneData?.markers.map((marker) => (
        <ProjectTimelineTelemetryMarker
          key={marker.id}
          kind={marker.kind}
          label={marker.label}
          left={marker.time * props.pixelsPerSecond}
        />
      ))}
    </div>
  );
}
