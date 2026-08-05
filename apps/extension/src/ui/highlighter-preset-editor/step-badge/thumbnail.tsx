import type { StepBadgeTemplateSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { resolveStepBadgeCustomCss } from '../../../features/highlighter/step-badge-custom-css';
import { resolveStepBadgeVisualStyle } from '../../../features/highlighter/step-badge-presets/style';

const PREVIEW_FRAME = {
  borderColor: '#f97316',
  borderWidth: 4,
  fillColor: '#fff7ed',
  fillOpacity: 1,
} as const;

function getPreviewMetrics(diameter: number, compact: boolean) {
  const scale = compact ? 0.75 : 1;
  const maxDiameter = compact ? 32 : 42;
  const minDiameter = compact ? 16 : 20;
  const previewDiameter = Math.round(
    Math.max(minDiameter, Math.min(maxDiameter, diameter * scale))
  );
  return {
    diameter: previewDiameter,
    fontSize: Math.max(10, Math.round(previewDiameter / 1.8)),
    sceneSize: compact ? 36 : 46,
  };
}

export function StepBadgePresetPreview(props: {
  compact?: boolean;
  settings: StepBadgeTemplateSettings;
}) {
  const compact = props.compact === true;
  const label =
    props.settings.type === 'letter'
      ? 'A'
      : props.settings.auto
        ? '1'
        : props.settings.value || '1';
  const visualStyle = resolveStepBadgeVisualStyle(props.settings, PREVIEW_FRAME);
  const metrics = getPreviewMetrics(visualStyle.diameter, compact);
  const customStyles = resolveStepBadgeCustomCss(props.settings.style.customCss ?? '').styles;
  return (
    <span
      aria-hidden="true"
      style={{
        alignItems: 'center',
        display: 'inline-flex',
        justifyContent: 'center',
        flex: `0 0 ${metrics.sceneSize}px`,
        height: metrics.sceneSize,
        width: metrics.sceneSize,
      }}
    >
      <span
        style={{
          alignItems: 'center',
          background: visualStyle.backgroundColor,
          border: `2px solid ${visualStyle.outlineColor}`,
          borderRadius: '50%',
          boxSizing: 'border-box',
          color: visualStyle.textColor,
          display: 'inline-flex',
          flex: `0 0 ${metrics.diameter}px`,
          fontSize: `${metrics.fontSize}px`,
          fontWeight: 700,
          height: metrics.diameter,
          justifyContent: 'center',
          lineHeight: 1,
          width: metrics.diameter,
          ...customStyles.badge,
        }}
      >
        <span style={customStyles.text}>{label}</span>
      </span>
    </span>
  );
}
