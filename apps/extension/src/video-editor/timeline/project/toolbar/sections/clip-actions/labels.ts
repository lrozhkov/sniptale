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

export function getClipActionTitle(kind: ClipActionKind, disabled: boolean): string {
  return getTimelineActionTitle({
    disabled,
    label: getClipActionLabel(kind),
  });
}
