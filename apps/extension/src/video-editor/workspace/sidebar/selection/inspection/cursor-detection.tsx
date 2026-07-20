import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { isCameraCursorObjectTrack } from '../../../../../features/video/project/object-tracks';
import type { VideoObjectTrack } from '../../../../../features/video/project/object-tracks';
import type { VideoProject } from '../../../../../features/video/project/types';
import { canGenerateMotionPathFromCursorTrack } from '../../../../project/motion-path/cursor-track';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { PANEL_META_CLASS_NAME } from '../shared/panel';

export function ClipCursorDetectionPanel(props: {
  clipId: string;
  cursorDetection: WorkspaceSidebarSelectionPanelProps['cursorDetection'];
  project: VideoProject;
}) {
  const cursorDetection = props.cursorDetection;
  const state = cursorDetection?.state;
  const running = state?.status === 'running';
  const disabled = !cursorDetection || running;
  const progressPercent = Math.round((state?.progress ?? 0) * 100);
  const track = findCameraCursorTrackForClip(props.project, props.clipId);

  return (
    <div className="space-y-3">
      {!running && track ? (
        <CursorDetectionTrackSummary project={props.project} track={track} />
      ) : null}
      <CursorDetectionRunControls
        clipId={props.clipId}
        cursorDetection={cursorDetection}
        disabled={disabled}
        hasTrack={track !== null}
        running={running}
      />
      {running && state ? (
        <CursorDetectionProgress state={state} progress={progressPercent} />
      ) : null}
      <CursorDetectionError clipId={props.clipId} cursorDetection={cursorDetection} />
      {!running && cursorDetection?.selectedClipAvailability.reason === 'missing-url' ? (
        <p className={PANEL_META_CLASS_NAME}>
          {translate('videoEditor.sidebar.cursorDetectionAssetMissing')}
        </p>
      ) : null}
    </div>
  );
}

function CursorDetectionRunControls(props: {
  clipId: string;
  cursorDetection: WorkspaceSidebarSelectionPanelProps['cursorDetection'];
  disabled: boolean;
  hasTrack: boolean;
  running: boolean;
}) {
  const buttonLabel = props.hasTrack
    ? translate('videoEditor.sidebar.cursorDetectionRunAgain')
    : translate('videoEditor.sidebar.cursorDetectionRun');

  return (
    <div className="flex items-center gap-2">
      <ProductActionButton
        data-ui="video-editor.cursor-detection.run"
        disabled={props.disabled}
        type="button"
        onClick={() => void props.cursorDetection?.runForClip(props.clipId)}
      >
        {buttonLabel}
      </ProductActionButton>
      {props.running ? (
        <ProductActionButton
          compact
          data-ui="video-editor.cursor-detection.cancel"
          type="button"
          onClick={() => props.cursorDetection?.cancel()}
        >
          {translate('videoEditor.sidebar.cursorDetectionCancel')}
        </ProductActionButton>
      ) : null}
    </div>
  );
}

function findCameraCursorTrackForClip(
  project: VideoProject,
  clipId: string
): VideoObjectTrack | null {
  return (
    (project.objectTracks ?? []).find(
      (track) => isCameraCursorObjectTrack(track) && track.analysis?.sourceClipId === clipId
    ) ?? null
  );
}

function CursorDetectionTrackSummary(props: { project: VideoProject; track: VideoObjectTrack }) {
  const visibleSamples = props.track.samples.filter((sample) => sample.visible).length;
  const statusKey = canGenerateMotionPathFromCursorTrack({
    project: props.project,
    region: { scale: 1 },
    track: props.track,
  })
    ? 'videoEditor.sidebar.cursorDetectionReadyForZoom'
    : 'videoEditor.sidebar.cursorDetectionNeedsCorrection';

  return (
    <div
      className="rounded-[10px] border border-[color:var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-muted)_72%,transparent)] px-3 py-2"
    >
      <p className="text-xs font-semibold text-[var(--sniptale-color-text-primary)]">
        {translate(statusKey)}
      </p>
      <p className={PANEL_META_CLASS_NAME}>
        {translate('videoEditor.sidebar.cursorDetectionVisibleSamples').replace(
          '{count}',
          String(visibleSamples)
        )}
      </p>
    </div>
  );
}

function CursorDetectionProgress(props: {
  progress: number;
  state: NonNullable<WorkspaceSidebarSelectionPanelProps['cursorDetection']>['state'];
}) {
  return (
    <div className={PANEL_META_CLASS_NAME}>
      {translate('videoEditor.sidebar.cursorDetectionProgress')
        .replace('{progress}', String(props.progress))
        .replace('{processed}', String(props.state.processedFrames))
        .replace('{total}', String(props.state.totalFrames))}
    </div>
  );
}

function CursorDetectionError(props: {
  clipId: string;
  cursorDetection: WorkspaceSidebarSelectionPanelProps['cursorDetection'];
}) {
  const state = props.cursorDetection?.state;
  if (state?.status !== 'failed') {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--sniptale-color-danger)]">{state.error}</p>
      <ProductActionButton
        compact
        data-ui="video-editor.cursor-detection.retry"
        type="button"
        onClick={() => void props.cursorDetection?.runForClip(props.clipId)}
      >
        {translate('videoEditor.sidebar.cursorDetectionRetry')}
      </ProductActionButton>
    </div>
  );
}
