import { translate } from '../../../../../../platform/i18n';
import { getTimelineActionTitle } from '../../helpers';

type ClipActionKind = 'delete' | 'duplicate' | 'split';

export function getClipActionLabel(kind: ClipActionKind): string {
  switch (kind) {
    case 'delete':
      return translate('videoEditor.timeline.delete');
    case 'duplicate':
      return translate('videoEditor.timeline.duplicate');
    case 'split':
      return translate('videoEditor.timeline.split');
  }
}

export function getClipActionTitle(
  kind: ClipActionKind,
  disabled: boolean,
  canEditSelectedClip = true
): string {
  if (disabled && !canEditSelectedClip) {
    return translate('videoEditor.timeline.clipLockedTitle');
  }

  if (!disabled) {
    return getEnabledClipActionTitle(kind);
  }

  return getTimelineActionTitle({
    disabled,
    label: getClipActionLabel(kind),
  });
}

export function getSplitActionTitle(
  canSplitSelectedClip: boolean,
  canEditSelectedClip = true
): string {
  if (!canEditSelectedClip) {
    return translate('videoEditor.timeline.clipLockedTitle');
  }

  return canSplitSelectedClip
    ? getEnabledClipActionTitle('split')
    : translate('videoEditor.timeline.splitUnavailableTitle');
}

function getEnabledClipActionTitle(kind: ClipActionKind): string {
  return `${getClipActionLabel(kind)} (${translate(`videoEditor.timeline.${kind}Shortcut`)})`;
}
