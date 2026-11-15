import { formatNumber, translate } from '../../../../platform/i18n';
import type { VideoProjectTransition } from '../../../../features/video/project/types';

const SHADER_ZONE_CLASS_NAME = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-warning)_32%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-warning-soft)_54%,transparent)]',
  'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-warning)_64%,transparent)]',
].join(' ');

const SHADER_ZONE_SELECTED_CLASS_NAME = [
  'border-[color:var(--sniptale-color-border-accent-strong)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-warning-soft)_72%,transparent)]',
  'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-warning)_26%,transparent)]',
].join(' ');

export function getTimelineTransitionSummary(transition: VideoProjectTransition) {
  const label =
    transition.kind === 'gl'
      ? transition.selection.name
      : translate('videoEditor.sidebar.inspectorGroupTransition');
  const renderLabel =
    transition.kind === 'gl'
      ? translate('videoEditor.sidebar.transitionRenderShader')
      : translate('videoEditor.sidebar.originalAudio');
  return {
    label,
    familyLabel: translate('videoEditor.sidebar.inspectorGroupTransition'),
    renderLabel,
    detail: renderLabel,
    title: `${label} · ${renderLabel}`,
    formatDurationLabel: formatTransitionDurationLabel,
    zoneClassName: SHADER_ZONE_CLASS_NAME,
    zoneSelectedClassName: SHADER_ZONE_SELECTED_CLASS_NAME,
  };
}

function formatTransitionDurationLabel(durationSeconds: number): string {
  const roundedTenths = Math.max(0, Math.round(durationSeconds * 10)) / 10;
  const hasFraction = Math.abs(roundedTenths - Math.round(roundedTenths)) > 0.0001;
  const formatted = formatNumber(roundedTenths, {
    maximumFractionDigits: hasFraction ? 1 : 0,
    minimumFractionDigits: hasFraction ? 1 : 0,
  });

  return `${formatted} ${translate('videoEditor.timeline.secondsSuffix')}`;
}
