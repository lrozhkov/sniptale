import type { StepBadgeTemplateSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';

export function StepBadgePresetPreview(props: {
  compact?: boolean;
  settings: StepBadgeTemplateSettings;
}) {
  const size = props.compact ? 28 : 36;
  const label =
    props.settings.type === 'letter'
      ? 'A'
      : props.settings.auto
        ? '1'
        : props.settings.value || '1';
  return (
    <span
      aria-hidden="true"
      style={{
        alignItems: 'center',
        background: props.settings.style.backgroundColor,
        border: `2px solid ${props.settings.style.outlineColor}`,
        borderRadius: '50%',
        color: props.settings.style.textColor,
        display: 'inline-flex',
        flex: `0 0 ${size}px`,
        fontSize: `${Math.round(size / 2.2)}px`,
        fontWeight: 700,
        height: size,
        justifyContent: 'center',
        width: size,
      }}
    >
      {label}
    </span>
  );
}
