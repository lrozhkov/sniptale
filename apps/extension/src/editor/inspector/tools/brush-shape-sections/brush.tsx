import { translate } from '../../../../platform/i18n';
import { ColorField, NumericRow } from '../../../chrome/ui';
import { EditorInspectorPresetHeader } from '../../presets';
import { HeaderValueToggleSection } from '../sections';
import type { BrushControlsProps } from './types';
import { buildBrushColorControlProps } from './shared';
import { renderPencilControlsSection } from './pencil';

function renderBrushColorPanel(
  tool: 'pencil' | 'highlighter',
  props: BrushControlsProps,
  settings: BrushControlsProps['inspectorToolSettings']['pencil']
) {
  const colorControlProps = buildBrushColorControlProps(
    tool,
    props,
    settings,
    props.shapeStrokePalette
  );
  const resolvedColorControlProps =
    tool === 'highlighter'
      ? {
          ...colorControlProps,
          onChange: (color: string) =>
            props.updateColor(
              (next: string) => props.applyBrushPatch(tool, { color: next, shadowColor: next }),
              color
            ),
          onPreviewChange: (color: string) =>
            props.previewColor(
              (next: string) => props.applyBrushPatch(tool, { color: next, shadowColor: next }),
              color
            ),
          onPreviewReset: (color: string) =>
            props.previewColor(
              (next: string) => props.applyBrushPatch(tool, { color: next, shadowColor: next }),
              color
            ),
        }
      : colorControlProps;

  const label = translate('editor.compact.color');

  return <ColorField title={label} label={label} {...resolvedColorControlProps} />;
}

function renderBrushWidthPanel(
  tool: 'pencil' | 'highlighter',
  props: BrushControlsProps,
  settings: BrushControlsProps['inspectorToolSettings']['pencil']
) {
  const label = translate('editor.compact.width');
  return renderBrushRangePanel(props, {
    label,
    max: tool === 'highlighter' ? 48 : 20,
    min: 1,
    onChange: (value) => props.previewBrushPatch(tool, { width: value }),
    value: settings.width,
    valueText: `${settings.width}px`,
  });
}

function renderBrushOpacityPanel(
  tool: 'pencil' | 'highlighter',
  props: BrushControlsProps,
  settings: BrushControlsProps['inspectorToolSettings']['pencil']
) {
  const label = translate('editor.compact.opacity');
  return renderBrushRangePanel(props, {
    label,
    max: 1,
    min: 0.05,
    onChange: (opacity) => props.previewBrushPatch(tool, { opacity }),
    step: 0.05,
    value: settings.opacity,
    valueText: `${Math.round(settings.opacity * 100)}%`,
  });
}

function renderBrushSmoothingPanel(
  tool: 'pencil' | 'highlighter',
  props: BrushControlsProps,
  settings: BrushControlsProps['inspectorToolSettings']['pencil']
) {
  const label = translate('editor.compact.smoothingLevel');
  const enabled = settings.smoothingLevel > 0;

  return (
    <HeaderValueToggleSection
      active={enabled}
      label={label}
      value={translate(enabled ? 'editor.compact.enabledShort' : 'editor.compact.disabledShort')}
      onToggle={() => props.applyBrushPatch(tool, { smoothingLevel: enabled ? 0 : 10 })}
    />
  );
}

function renderBrushRangePanel(
  props: BrushControlsProps,
  options: {
    label: string;
    max: number;
    min: number;
    onChange: (value: number) => void;
    step?: number;
    value: number;
    valueText: string;
  }
) {
  const percent = options.valueText.endsWith('%');
  const rowValue = percent ? Math.round(options.value * 100) : options.value;
  const min = percent ? Math.round(options.min * 100) : options.min;
  const max = percent ? Math.round(options.max * 100) : options.max;
  const step = percent ? Math.round((options.step ?? 0.05) * 100) : (options.step ?? 1);
  return (
    <NumericRow
      label={options.label}
      min={min}
      max={max}
      step={step}
      unit={percent ? '%' : 'px'}
      value={rowValue}
      scrub={{ min, max, step }}
      onPreviewValue={(value) => options.onChange(percent ? value / 100 : value)}
      onCommitValue={(value) => {
        options.onChange(percent ? value / 100 : value);
        props.commitPendingSelectionSettings();
      }}
    />
  );
}

export function renderBrushControlsSection(
  tool: 'pencil' | 'highlighter',
  props: BrushControlsProps
) {
  const settings = props.inspectorToolSettings[tool];
  const controls =
    tool === 'pencil'
      ? renderPencilControlsSection(props)
      : [
          renderBrushWidthPanel(tool, props, settings),
          renderBrushColorPanel(tool, props, settings),
          renderBrushOpacityPanel(tool, props, settings),
          renderBrushSmoothingPanel(tool, props, settings),
        ];

  return (
    <div className="space-y-3">
      {props.toolPresetHeader ? (
        <EditorInspectorPresetHeader state={props.toolPresetHeader}>
          {controls}
        </EditorInspectorPresetHeader>
      ) : (
        controls
      )}
    </div>
  );
}
