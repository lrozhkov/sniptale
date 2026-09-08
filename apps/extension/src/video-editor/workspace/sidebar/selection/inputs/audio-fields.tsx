import { Link2, Unlink } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
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
import { AudioEnvelopeFields, AudioMuteToggle, AudioVolumeField } from './audio-controls';

function renderSharedAudioFields(params: {
  clip: VideoProjectClip;
  disabled: boolean;
  label: string;
  onUpdateClipAudioEnvelope: WorkspaceSidebarProps['onUpdateClipAudioEnvelope'];
  onUpdateClipMuted: WorkspaceSidebarProps['onUpdateClipMuted'];
  onUpdateClipVolume: WorkspaceSidebarProps['onUpdateClipVolume'];
}) {
  const gainRange = getClipGainRange(params.clip);
  const sharedVolumeValue =
    Math.abs(gainRange.start - gainRange.end) < 0.0001
      ? gainRange.start
      : Number(((gainRange.start + gainRange.end) / 2).toFixed(2));

  return (
    <>
      <AudioMuteToggle
        checked={!params.clip.muted}
        disabled={params.disabled}
        label={params.label}
        onChange={(checked) => params.onUpdateClipMuted(params.clip.id, !checked)}
      />
      <AudioVolumeField
        disabled={params.disabled}
        value={sharedVolumeValue}
        onChange={(value) => params.onUpdateClipVolume(params.clip.id, value)}
      />
      <AudioEnvelopeFields
        disabled={params.disabled}
        endValue={gainRange.end}
        startValue={gainRange.start}
        onChange={(patch) => params.onUpdateClipAudioEnvelope(params.clip.id, patch)}
      />
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
  if (!clip || (!isVideoClip(clip) && !isAudioClip(clip))) return null;
  const linkedIds = getLinkedClipIds(props.project, clip.id);
  const companions = props.project.clips.filter(
    (item) => item.id !== clip.id && linkedIds.includes(item.id)
  );
  const audio = isVideoClip(clip) ? (companions.find(isAudioClip) ?? clip) : clip;
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
            <ProductActionButton
              tone="secondary"
              compact
              title={translate('videoEditor.sidebar.detachButton')}
              disabled={!areProjectClipsEditable(props.project, linkedIds)}
              onClick={() => props.onDetachClipGroup(clip.id)}
            >
              <Unlink size={14} aria-hidden="true" />
              {translate('videoEditor.sidebar.detachButton')}
            </ProductActionButton>
          </div>
          <p className="mt-2 text-xs text-[var(--sniptale-color-text-dim)]">
            {translate('videoEditor.sidebar.linkedClipsDescription')}
          </p>
        </div>
      ) : null}
      {renderSharedAudioFields({
        clip: audio,
        disabled: !areProjectClipsEditable(props.project, [audio.id]),
        label: translate('videoEditor.sidebar.videoSoundLabel'),
        onUpdateClipAudioEnvelope: props.onUpdateClipAudioEnvelope,
        onUpdateClipMuted: props.onUpdateClipMuted,
        onUpdateClipVolume: props.onUpdateClipVolume,
      })}
    </>
  );
}
