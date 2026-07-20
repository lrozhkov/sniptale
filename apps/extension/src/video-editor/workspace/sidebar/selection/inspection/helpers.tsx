import { translate } from '../../../../../platform/i18n';
import { VideoClipLinkMode } from '../../../../../features/video/project/types';
import type { WorkspaceSidebarProps } from '../../contracts/props';

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function createSelectionRuntime(
  props: Pick<WorkspaceSidebarProps, 'project' | 'selectedClip' | 'selectedTrack'>
) {
  const { project, selectedClip, selectedTrack } = props;
  const clipTrack =
    selectedClip === null
      ? null
      : (project.tracks.find((track) => track.id === selectedClip.trackId) ?? null);

  const linkedGroupClips =
    selectedClip?.groupId && selectedClip.linkMode === VideoClipLinkMode.LINKED
      ? project.clips.filter(
          (clip) =>
            clip.groupId === selectedClip.groupId &&
            clip.id !== selectedClip.id &&
            clip.linkMode === VideoClipLinkMode.LINKED
        )
      : [];

  return {
    linkedAudioClip: linkedGroupClips.find((clip) => clip.type === 'AUDIO') ?? null,
    linkedVideoClip: linkedGroupClips.find((clip) => clip.type === 'VIDEO') ?? null,
    selectedTrackLocked: Boolean((selectedTrack ?? clipTrack)?.locked),
  };
}

export function SelectionEmptyState() {
  return (
    <div
      className={cx(
        'rounded-[14px] border border-dashed bg-[color:var(--sniptale-color-surface-panel)] px-3 py-4',
        'border-[color:var(--sniptale-color-border-soft)] text-sm text-[var(--sniptale-color-text-secondary)]'
      )}
    >
      {translate('videoEditor.sidebar.selectionEmpty')}
    </div>
  );
}

export function SelectionLockedState() {
  return (
    <div
      className={cx(
        'rounded-[14px] border px-3 py-3 text-sm text-[var(--sniptale-color-text-primary)]',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-warning)_28%,var(--sniptale-color-border-soft)_72%)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-warning)_12%,transparent)]'
      )}
    >
      <p className="font-medium">{translate('videoEditor.sidebar.lockedTrackTitle')}</p>
      <p className="mt-1 text-xs text-[var(--sniptale-color-text-secondary)]">
        {translate('videoEditor.sidebar.lockedTrackDescription')}
      </p>
    </div>
  );
}
