import {
  isAnnotationClip,
  isSubtitleClip,
  isTextClip,
} from '../../../../../features/video/project/timeline';
import { getAssetById } from '../../../../../features/video/project/timeline/basics';
import { VideoProjectClipType } from '../../../../../features/video/project/types';
import { translate } from '../../../../../platform/i18n';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { DetailItem, DetailList, PANEL_META_CLASS_NAME } from '../shared/panel';
import { SelectionLockedState } from './helpers';

export function ClipInfo(props: {
  asset: ReturnType<typeof resolveClipAsset>;
  clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>;
  locked: boolean;
}) {
  return (
    <div className="space-y-3">
      {props.locked ? <SelectionLockedState /> : null}
      <ClipOverviewDetails assetName={props.asset?.name ?? null} clip={props.clip} />
      <ClipAssetMeta asset={props.asset} />
    </div>
  );
}

export function resolveClipAsset(
  project: WorkspaceSidebarSelectionPanelProps['project'],
  selectedClip: WorkspaceSidebarSelectionPanelProps['selectedClip']
) {
  if (!selectedClip) {
    return null;
  }

  if (
    isAnnotationClip(selectedClip) ||
    isTextClip(selectedClip) ||
    isSubtitleClip(selectedClip) ||
    selectedClip.type === VideoProjectClipType.EFFECT ||
    selectedClip.type === VideoProjectClipType.SHAPE
  ) {
    return null;
  }

  return getAssetById(project, selectedClip.assetId);
}

function ClipOverviewDetails(props: {
  assetName: string | null;
  clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>;
}) {
  return (
    <div className="mt-3">
      <DetailList>
        <DetailItem
          label={translate('videoEditor.sidebar.actionTimePrefix')}
          value={`${props.clip.startTime.toFixed(1)}s - ${(props.clip.startTime + props.clip.duration).toFixed(1)}s`}
        />
        {props.assetName && props.assetName !== props.clip.name ? (
          <DetailItem
            label={translate('videoEditor.sidebar.projectSourceLabel')}
            value={props.assetName}
          />
        ) : null}
      </DetailList>
    </div>
  );
}

function ClipAssetMeta(props: { asset: ReturnType<typeof resolveClipAsset> }) {
  if (!props.asset) {
    return null;
  }

  const { width, height, duration } = props.asset.metadata;
  const dimensions = width > 0 && height > 0 ? `${width}×${height}` : '';
  const seconds = duration
    ? `${duration.toFixed(1)} ${translate('videoEditor.sidebar.typingSeconds')}`
    : '';
  return (
    <p className={PANEL_META_CLASS_NAME}>{[dimensions, seconds].filter(Boolean).join(' · ')}</p>
  );
}
