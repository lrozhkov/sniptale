import { translate } from '../../platform/i18n';
import type {
  VideoTemplatePreviewMetadata,
  VideoTemplatePreviewTone,
} from '../../features/video/project/template/preview';

const BADGE_BASE_CLASS_NAME = [
  'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase',
  'tracking-[0.12em]',
].join(' ');

const CALM_BADGE_CLASS_NAME = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_86%,transparent)]',
  'text-[var(--sniptale-color-text-dim)]',
].join(' ');

const EDITORIAL_TONE_CLASS_NAME = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-warning)_24%,var(--sniptale-color-border-soft)_76%)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-warning)_14%,transparent)]',
  'text-[var(--sniptale-color-warning)]',
].join(' ');

const GUIDED_TONE_CLASS_NAME = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_28%,var(--sniptale-color-border-soft)_72%)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_18%,transparent)]',
  'text-[var(--sniptale-color-accent)]',
].join(' ');

const HERO_TONE_CLASS_NAME = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_28%,var(--sniptale-color-border-soft)_72%)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_16%,transparent)]',
  'text-[var(--sniptale-color-accent)]',
].join(' ');

const TECHNICAL_TONE_CLASS_NAME = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-info)_24%,var(--sniptale-color-border-soft)_76%)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-info)_14%,transparent)]',
  'text-[var(--sniptale-color-info)]',
].join(' ');

const BADGE_TONE_CLASS_NAMES: Record<VideoTemplatePreviewTone, string> = {
  CALM: CALM_BADGE_CLASS_NAME,
  EDITORIAL: EDITORIAL_TONE_CLASS_NAME,
  GUIDED: GUIDED_TONE_CLASS_NAME,
  HERO: HERO_TONE_CLASS_NAME,
  TECHNICAL: TECHNICAL_TONE_CLASS_NAME,
};

export function TemplatePreviewBadges(props: { preview: VideoTemplatePreviewMetadata }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <span className={`${BADGE_BASE_CLASS_NAME} ${getToneBadgeClassName(props.preview.tone)}`}>
        {translate(props.preview.toneLabelKey)}
      </span>
      <span className={`${BADGE_BASE_CLASS_NAME} ${getMotionBadgeClassName()}`}>
        {translate(props.preview.motionLabelKey)}
      </span>
    </div>
  );
}

function getToneBadgeClassName(tone: VideoTemplatePreviewTone): string {
  return BADGE_TONE_CLASS_NAMES[tone];
}

function getMotionBadgeClassName(): string {
  return [
    'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_42%,transparent)]',
    'text-[var(--sniptale-color-text-secondary)]',
  ].join(' ');
}
