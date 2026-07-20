import {
  isAnnotationClip,
  isSubtitleClip,
  isTextClip,
} from '../../../../../features/video/project/timeline';
import { getAssetById } from '../../../../../features/video/project/timeline/basics';
import { VideoProjectClipType } from '../../../../../features/video/project/types';
import { translate } from '../../../../../platform/i18n';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { getClipTypeLabel } from '../../../../chrome/display';
import {
  DetailItem,
  DetailList,
  PANEL_HEADING_CLASS_NAME,
  PANEL_META_CLASS_NAME,
} from '../shared/panel';
import { SelectionLockedState } from './helpers';

export function ClipInfo(props: {
  asset: ReturnType<typeof resolveClipAsset>;
  clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>;
  locked: boolean;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className={PANEL_HEADING_CLASS_NAME}>{props.clip.name}</p>
        <p className={`mt-1 ${PANEL_META_CLASS_NAME}`}>{getClipTypeLabel(props.clip)}</p>
      </div>
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
        {props.assetName ? (
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

  return (
    <div className="mt-3">
      <p className={PANEL_META_CLASS_NAME}>{props.asset.name}</p>
      <p className={`mt-1 ${PANEL_META_CLASS_NAME}`}>
        {`${props.asset.metadata.width}x${props.asset.metadata.height}`}
        {props.asset.metadata.duration ? ` / ${props.asset.metadata.duration.toFixed(1)}s` : ''}
      </p>
    </div>
  );
}
