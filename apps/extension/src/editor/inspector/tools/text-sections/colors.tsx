import { translate } from '../../../../platform/i18n';
import { ColorField, NumericRow } from '../../../chrome/ui';
import type { TextControlsProps, TextSettings } from './types';

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function renderTextColorSection(
  props: {
    label: string;
    onChange: (color: string) => void;
    onPreviewChange: (color: string) => void;
    palette: readonly string[];
    value: string;
  },
  recentColors: string[]
) {
  return (
    <ColorField
      title={props.label}
      label={props.label}
      value={props.value}
      recentColors={recentColors}
      palette={props.palette}
      onChange={props.onChange}
      onPreviewChange={props.onPreviewChange}
      onPreviewReset={props.onPreviewChange}
    />
  );
}

function renderUnitOpacityPanel(props: {
  label: string;
  onChange: (value: number) => void;
  onValueCommit: () => void;
  value: number;
}) {
  const value = Math.round(props.value * 100);

  return (
    <NumericRow
      label={props.label}
      value={value}
      unit="%"
      min={0}
      max={100}
      step={5}
      onPreviewValue={(nextValue) => props.onChange(clampUnit(nextValue / 100))}
      onCommitValue={(nextValue) => {
        props.onChange(clampUnit(nextValue / 100));
        props.onValueCommit();
      }}
      scrub={{ min: 0, max: 100, step: 5 }}
    />
  );
}

export function renderTextOpacityPanel(props: TextControlsProps, settings: TextSettings) {
  const label = translate('editor.compact.opacity');
  return renderUnitOpacityPanel({
    label,
    value: settings.textOpacity,
    onChange: (textOpacity) => props.previewTextPatch({ textOpacity }),
    onValueCommit: props.commitPendingSelectionSettings,
  });
}

export function renderTextForegroundColorSection(props: TextControlsProps, settings: TextSettings) {
  return renderTextColorSection(
    {
      label: translate('editor.compact.textColor'),
      palette: props.textColorPalette,
      value: settings.textColor,
      onChange: (color) =>
        props.updateColor((next: string) => props.applyTextPatch({ textColor: next }), color),
      onPreviewChange: (color) =>
        props.previewColor((next: string) => props.applyTextPatch({ textColor: next }), color),
    },
    props.recentColors
  );
}

export function renderTextBackgroundColorSection(props: TextControlsProps, settings: TextSettings) {
  return renderTextColorSection(
    {
      label: translate('editor.compact.backgroundColor'),
      palette: props.textBackgroundPalette,
      value: settings.backgroundColor,
      onChange: (color) =>
        props.updateColor((next: string) => props.applyTextPatch({ backgroundColor: next }), color),
      onPreviewChange: (color) =>
        props.previewColor(
          (next: string) => props.applyTextPatch({ backgroundColor: next }),
          color
        ),
    },
    props.recentColors
  );
}

export function renderTextBackgroundOpacityPanel(props: TextControlsProps, settings: TextSettings) {
  const label = translate('editor.compact.opacity');
  return renderUnitOpacityPanel({
    label,
    value: settings.backgroundOpacity,
    onChange: (backgroundOpacity) => props.previewTextPatch({ backgroundOpacity }),
    onValueCommit: props.commitPendingSelectionSettings,
  });
}

export function renderTextShadowColorSection(props: TextControlsProps, settings: TextSettings) {
  const label = translate('editor.compact.color');
  return renderTextColorSection(
    {
      label,
      palette: props.textColorPalette,
      value: settings.shadowColor ?? settings.textColor,
      onChange: (color) =>
        props.updateColor((next: string) => props.applyTextPatch({ shadowColor: next }), color),
      onPreviewChange: (color) =>
        props.previewColor((next: string) => props.applyTextPatch({ shadowColor: next }), color),
    },
    props.recentColors
  );
}
