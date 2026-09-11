import { InspectorDetails } from '../shared/details';
import { Link2, Unlink } from 'lucide-react';
import { InspectorActionButton } from '../shared/actions';
import { translate } from '../../../../../platform/i18n';
import {
  areProjectClipsEditable,
  getLinkedClipIds,
  isAudioClip,
  isVideoClip,
} from '../../../../../features/video/project/timeline';
import { getClipGainRange } from '../../../../../features/video/project/timeline/basics';
import type { VideoProjectClip } from '../../../../../features/video/project/types';
import type { WorkspaceSidebarProps } from '../../contracts/props';
import { AudioEnvelopeFields, AudioVolumeField } from './audio-controls';

function renderSharedAudioFields(params: {
  clip: VideoProjectClip;
  disabled: boolean;
  onUpdateClipAudioEnvelope: WorkspaceSidebarProps['onUpdateClipAudioEnvelope'];
  onUpdateClipVolume: WorkspaceSidebarProps['onUpdateClipVolume'];
}) {
  const gainRange = getClipGainRange(params.clip);
  const sharedVolumeValue =
    Math.abs(gainRange.start - gainRange.end) < 0.0001
      ? gainRange.start
      : Number(((gainRange.start + gainRange.end) / 2).toFixed(2));

  return (
    <>
      <AudioVolumeField
        disabled={params.disabled}
        value={sharedVolumeValue}
        onChange={(value) => params.onUpdateClipVolume(params.clip.id, value)}
      />
      <InspectorDetails label={translate('videoEditor.sidebar.inspectorEnvelope')}>
        <AudioEnvelopeFields
          disabled={params.disabled}
          endValue={gainRange.end}
          startValue={gainRange.start}
          onChange={(patch) => params.onUpdateClipAudioEnvelope(params.clip.id, patch)}
        />
      </InspectorDetails>
    </>
  );
}

export function renderAudioFields(
  props: Pick<
    WorkspaceSidebarProps,
    | 'project'
    | 'selectedClip'
    | 'onUpdateClipMuted'
    | 'onUpdateClipVolume'
    | 'onUpdateClipAudioEnvelope'
    | 'onDetachClipGroup'
  >
) {
  const clip = props.selectedClip;
  if (!clip || !isAudioClip(clip)) return null;
  return renderSharedAudioFields({
    clip,
    disabled: !areProjectClipsEditable(props.project, [clip.id]),
    onUpdateClipAudioEnvelope: props.onUpdateClipAudioEnvelope,
    onUpdateClipVolume: props.onUpdateClipVolume,
  });
}

export function renderClipLinkFields(
  props: Pick<WorkspaceSidebarProps, 'project' | 'selectedClip' | 'onDetachClipGroup'>
) {
  const clip = props.selectedClip;
  if (!clip || (!isVideoClip(clip) && !isAudioClip(clip))) return null;
  const linkedIds = getLinkedClipIds(props.project, clip.id);
  const companions = props.project.clips.filter(
    (item) => item.id !== clip.id && linkedIds.includes(item.id)
  );
  return (
    <>
      {companions.length > 0 ? (
        <div className="mb-3 border-b border-[var(--sniptale-color-border-subtle)] pb-3">
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <Link2 size={14} className="shrink-0" aria-hidden="true" />
            <span
              className="min-w-0 flex-1 truncate"
              title={companions.map((item) => item.name).join(', ')}
            >
              {companions.map((item) => item.name).join(', ')}
            </span>
            <InspectorActionButton
              tone="secondary"
              compact
              title={translate('videoEditor.sidebar.detachButton')}
              disabled={!areProjectClipsEditable(props.project, linkedIds)}
              onClick={() => props.onDetachClipGroup(clip.id)}
            >
              <Unlink size={14} aria-hidden="true" />
              {translate('videoEditor.sidebar.detachButton')}
            </InspectorActionButton>
          </div>
        </div>
      ) : null}
    </>
  );
}
