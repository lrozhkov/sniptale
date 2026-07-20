import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { type VideoObjectTrackSample } from '../../../../../features/video/project/object-tracks';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { InspectorGroupedPanel } from '../grouped-inspector';
import { SelectionEmptyState } from './helpers';
import { ObjectTrackSummaryCard } from './object-tracks';
import { PANEL_META_CLASS_NAME, PANEL_SECTION_CLASS_NAME } from '../shared/panel';

const MAX_CONFIDENCE_STRIP_SEGMENTS = 160;

export function InspectObjectTrackPanel(props: WorkspaceSidebarSelectionPanelProps) {
  const objectTrack = props.selectedObjectTrack;
  if (!objectTrack) {
    return <SelectionEmptyState />;
  }

  return (
    <section className={PANEL_SECTION_CLASS_NAME}>
      <InspectorGroupedPanel groups={createObjectTrackGroups(props, objectTrack)} />
    </section>
  );
}

function createObjectTrackGroups(
  props: WorkspaceSidebarSelectionPanelProps,
  objectTrack: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedObjectTrack']>
) {
  return [
    {
      id: 'info',
      label: translate('videoEditor.sidebar.inspectorGroupSummary'),
      defaultActive: true,
      content: (
        <ObjectTrackSummaryCard
          selected
          track={objectTrack}
          onDeleteObjectTrack={props.onDeleteObjectTrack}
        />
      ),
    },
    {
      id: 'samples',
      label: translate('videoEditor.sidebar.inspectorGroupStatus'),
      content: <ObjectTrackConfidencePanel props={props} />,
    },
    {
      id: 'correction',
      label: translate('videoEditor.sidebar.inspectorGroupCorrection'),
      content: <ObjectTrackCorrectionPanel props={props} />,
    },
  ] as const;
}

function ObjectTrackConfidencePanel({ props }: { props: WorkspaceSidebarSelectionPanelProps }) {
  const track = props.selectedObjectTrack;
  if (!track) {
    return null;
  }

  const lowConfidenceCount = track.samples.filter(
    (sample) => !sample.visible || sample.confidence < 0.45
  ).length;
  const confidenceSegments = createConfidenceSegments(track.samples);

  return (
    <div className="space-y-3">
      <div className="flex h-2 overflow-hidden rounded-full bg-[var(--sniptale-color-surface-muted)]">
        {confidenceSegments.map((segment, index) => (
          <span
            key={`${segment.time}-${index}`}
            className={getConfidenceSegmentClassName(segment.visible, segment.confidence)}
            data-ui="video-editor.object-track.confidence-segment"
            style={{ flex: segment.weight }}
          />
        ))}
      </div>
      <p className={PANEL_META_CLASS_NAME}>
        {translate('videoEditor.sidebar.objectTrackLowConfidenceSummary').replace(
          '{count}',
          String(lowConfidenceCount)
        )}
      </p>
    </div>
  );
}

function createConfidenceSegments(samples: readonly VideoObjectTrackSample[]) {
  if (samples.length <= MAX_CONFIDENCE_STRIP_SEGMENTS) {
    return samples.map((sample) => ({
      confidence: sample.confidence,
      time: sample.time,
      visible: sample.visible,
      weight: 1,
    }));
  }

  const segmentSize = samples.length / MAX_CONFIDENCE_STRIP_SEGMENTS;
  return Array.from({ length: MAX_CONFIDENCE_STRIP_SEGMENTS }, (_, index) => {
    const start = Math.floor(index * segmentSize);
    const end = Math.max(start + 1, Math.floor((index + 1) * segmentSize));
    const segmentSamples = samples.slice(start, Math.min(end, samples.length));
    const hasInvisibleSample = segmentSamples.some((sample) => !sample.visible);
    const confidence =
      segmentSamples.reduce((sum, sample) => sum + sample.confidence, 0) / segmentSamples.length;

    return {
      confidence,
      time: segmentSamples[0]?.time ?? index,
      visible: !hasInvisibleSample,
      weight: segmentSamples.length,
    };
  });
}

function ObjectTrackCorrectionPanel({ props }: { props: WorkspaceSidebarSelectionPanelProps }) {
  const track = props.selectedObjectTrack;
  if (!track) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <ProductActionButton
          compact
          data-ui="video-editor.object-track.place-correction"
          type="button"
          onClick={() => props.onStartObjectTrackAnchorPlacement?.(track.id)}
        >
          {translate('videoEditor.sidebar.objectTrackCorrectionPlace')}
        </ProductActionButton>
        <ProductActionButton
          compact
          data-ui="video-editor.object-track.recalculate"
          disabled={!track.analysis}
          type="button"
          onClick={() => void props.cursorDetection?.runLocalRecalculation(track.id)}
        >
          {translate('videoEditor.sidebar.objectTrackRecalculateLocal')}
        </ProductActionButton>
      </div>
    </div>
  );
}

function getConfidenceSegmentClassName(visible: boolean, confidence: number): string {
  if (!visible) {
    return 'bg-[var(--sniptale-color-danger)]';
  }
  return confidence < 0.45
    ? 'bg-[var(--sniptale-color-warning)]'
    : 'bg-[var(--sniptale-color-success)]';
}
