import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { VideoObjectTrack } from '../../../../../features/video/project/object-tracks';
import { isInternalVideoObjectTrack } from '../../../../../features/video/project/object-tracks';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { DangerButton } from '../effect-controls/fields';
import {
  DetailItem,
  DetailList,
  PANEL_DIVIDER_CLASS_NAME,
  PANEL_HEADING_CLASS_NAME,
  PANEL_META_CLASS_NAME,
} from '../shared/panel';

export function SceneObjectTracksPanel(props: {
  objectTracks: VideoObjectTrack[];
  onDeleteObjectTrack?: WorkspaceSidebarSelectionPanelProps['onDeleteObjectTrack'];
  onSelectObjectTrack?: WorkspaceSidebarSelectionPanelProps['onSelectObjectTrack'];
  selectedObjectTrackId?: string | null;
}) {
  const visibleTracks = props.objectTracks.filter((track) => !isInternalVideoObjectTrack(track));
  return (
    <div className="space-y-3">
      <p className={PANEL_HEADING_CLASS_NAME}>
        {translate('videoEditor.sidebar.objectTracksTitle')}
      </p>
      <div className="space-y-3">
        {visibleTracks.map((track) => (
          <ObjectTrackSummaryCard
            key={track.id}
            track={track}
            onDeleteObjectTrack={props.onDeleteObjectTrack}
            onSelectObjectTrack={props.onSelectObjectTrack}
            selected={props.selectedObjectTrackId === track.id}
          />
        ))}
      </div>
    </div>
  );
}

export function ObjectTrackSummaryCard(props: {
  track: VideoObjectTrack;
  onDeleteObjectTrack?: WorkspaceSidebarSelectionPanelProps['onDeleteObjectTrack'];
  onSelectObjectTrack?: WorkspaceSidebarSelectionPanelProps['onSelectObjectTrack'];
  selected?: boolean;
}) {
  const summary = getObjectTrackSummary(props.track);

  return (
    <div className={`space-y-3 pt-3 first:pt-0 first:border-t-0 ${PANEL_DIVIDER_CLASS_NAME}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            {summary.title}
          </p>
          <p className={`mt-1 ${PANEL_META_CLASS_NAME}`}>{props.track.id}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ProductActionButton
            compact
            data-ui="video-editor.object-track.select"
            disabled={props.selected}
            type="button"
            onClick={() => props.onSelectObjectTrack?.(props.track.id)}
          >
            {translate(
              props.selected
                ? 'videoEditor.sidebar.objectTrackSelectedLabel'
                : 'videoEditor.sidebar.objectTrackSelectLabel'
            )}
          </ProductActionButton>
          <DangerButton
            label={translate('videoEditor.sidebar.objectTrackDeleteLabel')}
            onClick={() => props.onDeleteObjectTrack?.(props.track.id)}
          />
        </div>
      </div>
      <SceneObjectTrackDetails detectorVersion={props.track.detectorVersion} summary={summary} />
    </div>
  );
}

function SceneObjectTrackDetails(props: {
  detectorVersion: string | undefined;
  summary: ReturnType<typeof getObjectTrackSummary>;
}) {
  return (
    <DetailList>
      <DetailItem
        label={translate('videoEditor.sidebar.objectTrackSourceLabel')}
        value={props.summary.source}
      />
      {props.detectorVersion ? (
        <DetailItem
          label={translate('videoEditor.sidebar.objectTrackDetectorLabel')}
          value={props.detectorVersion}
        />
      ) : null}
      <DetailItem
        label={translate('videoEditor.sidebar.objectTrackSamplesLabel')}
        value={String(props.summary.samples)}
      />
      <DetailItem
        label={translate('videoEditor.sidebar.objectTrackVisibleSamplesLabel')}
        value={String(props.summary.visibleSamples)}
      />
      <DetailItem
        label={translate('videoEditor.sidebar.objectTrackConfidenceLabel')}
        value={props.summary.confidence}
      />
      <DetailItem
        label={translate('videoEditor.sidebar.objectTrackTimeRangeLabel')}
        value={props.summary.timeRange}
      />
    </DetailList>
  );
}

function getObjectTrackSummary(track: VideoObjectTrack) {
  const samples = track.samples;
  const visibleSamples = samples.filter((sample) => sample.visible);
  const confidence =
    visibleSamples.length > 0
      ? visibleSamples.reduce((sum, sample) => sum + sample.confidence, 0) / visibleSamples.length
      : 0;
  const sortedTimes = samples.map((sample) => sample.time).sort((left, right) => left - right);
  const firstTime = sortedTimes[0] ?? 0;
  const lastTime = sortedTimes[sortedTimes.length - 1] ?? firstTime;

  return {
    confidence: `${Math.round(confidence * 100)}%`,
    samples: samples.length,
    source: getObjectTrackSourceLabel(track.source),
    timeRange: `${firstTime.toFixed(2)}-${lastTime.toFixed(2)} s`,
    title: getObjectTrackKindLabel(track.kind),
    visibleSamples: visibleSamples.length,
  };
}

function getObjectTrackKindLabel(kind: VideoObjectTrack['kind']) {
  switch (kind) {
    case 'cursor':
      return translate('videoEditor.sidebar.objectTrackKindCursor');
    case 'visualCursor':
      return translate('videoEditor.sidebar.objectTrackKindVisualCursor');
    case 'object':
      return translate('videoEditor.sidebar.objectTrackKindObject');
  }
}

function getObjectTrackSourceLabel(source: VideoObjectTrack['source']) {
  switch (source) {
    case 'manual':
      return translate('videoEditor.sidebar.objectTrackSourceManual');
    case 'telemetry':
      return translate('videoEditor.sidebar.objectTrackSourceTelemetry');
    case 'visualDetection':
      return translate('videoEditor.sidebar.objectTrackSourceVisualDetection');
  }
}
