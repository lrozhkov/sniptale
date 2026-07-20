import { translate } from '../../../../platform/i18n';

export function getTimelineActionTitle(params: { disabled: boolean; label: string }): string {
  return params.disabled
    ? `${params.label} · ${translate('videoEditor.timeline.selectionRequiredTitle')}`
    : params.label;
}
