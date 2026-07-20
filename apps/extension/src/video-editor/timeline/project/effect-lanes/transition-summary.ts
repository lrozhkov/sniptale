import { formatNumber, translate } from '../../../../platform/i18n';
import { getVideoTransitionTemplateDefinition } from '../../../../features/video/project/transition/template';
import { VideoTransitionRenderKind } from '../../../../features/video/project/types';
import type { VideoProjectTransition } from '../../../../features/video/project/types';

const COMPOSITE_ZONE_CLASS_NAME = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_26%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_52%,transparent)]',
  'hover:border-[color:var(--sniptale-color-border-accent-strong)]',
].join(' ');

const CSS_LIKE_ZONE_CLASS_NAME = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-info)_30%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-info)_20%,transparent)]',
  'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-info)_56%,transparent)]',
].join(' ');

const SHADER_ZONE_CLASS_NAME = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-warning)_32%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-warning-soft)_54%,transparent)]',
  'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-warning)_64%,transparent)]',
].join(' ');

const COMPOSITE_ZONE_SELECTED_CLASS_NAME = [
  'border-[color:var(--sniptale-color-border-accent-strong)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_68%,transparent)]',
  'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent-emphasis)_32%,transparent)]',
].join(' ');

const CSS_LIKE_ZONE_SELECTED_CLASS_NAME = [
  'border-[color:var(--sniptale-color-border-accent-strong)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-info)_28%,transparent)]',
  'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-info)_32%,transparent)]',
].join(' ');

const SHADER_ZONE_SELECTED_CLASS_NAME = [
  'border-[color:var(--sniptale-color-border-accent-strong)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-warning-soft)_72%,transparent)]',
  'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-warning)_26%,transparent)]',
].join(' ');

interface TimelineTransitionSummary {
  detail: string;
  familyLabel: string;
  formatDurationLabel: (durationSeconds: number) => string;
  label: string;
  renderLabel: string;
  title: string;
  zoneClassName: string;
  zoneSelectedClassName: string;
}

export function getTimelineTransitionSummary(
  transition: Pick<VideoProjectTransition, 'kind' | 'templateKind'>
): TimelineTransitionSummary {
  const definition = getVideoTransitionTemplateDefinition(
    transition.templateKind ?? transition.kind
  );
  const familyLabel = translate(definition.groupLabelKey);
  const label = translate(definition.labelKey);
  const renderLabel = getTransitionRenderLabel(definition.renderKind);
  const detail = `${familyLabel} · ${renderLabel}`;

  return {
    detail,
    familyLabel,
    formatDurationLabel: formatTransitionDurationLabel,
    label,
    renderLabel,
    title: `${label} · ${detail}`,
    zoneClassName: getTransitionZoneClassName(definition.renderKind),
    zoneSelectedClassName: getSelectedTransitionZoneClassName(definition.renderKind),
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

function getTransitionRenderLabel(renderKind: VideoTransitionRenderKind): string {
  switch (renderKind) {
    case VideoTransitionRenderKind.COMPOSITE:
      return translate('videoEditor.sidebar.transitionRenderComposite');
    case VideoTransitionRenderKind.CSS_LIKE:
      return translate('videoEditor.sidebar.transitionRenderCssLike');
    case VideoTransitionRenderKind.SHADER:
      return translate('videoEditor.sidebar.transitionRenderShader');
  }
}

function getTransitionZoneClassName(renderKind: VideoTransitionRenderKind): string {
  switch (renderKind) {
    case VideoTransitionRenderKind.COMPOSITE:
      return COMPOSITE_ZONE_CLASS_NAME;
    case VideoTransitionRenderKind.CSS_LIKE:
      return CSS_LIKE_ZONE_CLASS_NAME;
    case VideoTransitionRenderKind.SHADER:
      return SHADER_ZONE_CLASS_NAME;
  }
}

function getSelectedTransitionZoneClassName(renderKind: VideoTransitionRenderKind): string {
  switch (renderKind) {
    case VideoTransitionRenderKind.COMPOSITE:
      return COMPOSITE_ZONE_SELECTED_CLASS_NAME;
    case VideoTransitionRenderKind.CSS_LIKE:
      return CSS_LIKE_ZONE_SELECTED_CLASS_NAME;
    case VideoTransitionRenderKind.SHADER:
      return SHADER_ZONE_SELECTED_CLASS_NAME;
  }
}
