import { translate } from '../../../../platform/i18n';
import { ColorField } from '../../../chrome/ui';
import { createEditorColorPatchHandlers } from '../color-actions';
import { type InspectorNumericRowOptions, renderInspectorNumericRow } from '../numeric-row-section';
import { CollapsibleSection, HeaderValueToggleSection } from '../sections';
import {
  ShadowAngleSection,
  ShadowBlurSection,
  ShadowDistanceSection,
  ShadowRangeSection,
} from '../shadow';
import { buildBrushColorControlProps } from './shared';
import type { BrushControlsProps } from './types';

function renderPencilRangePanel(props: BrushControlsProps, options: InspectorNumericRowOptions) {
  return renderInspectorNumericRow({
    ...options,
    commit: props.commitPendingSelectionSettings,
    scalePercent: true,
  });
}

function renderPencilColorPanel(
  props: BrushControlsProps,
  settings: BrushControlsProps['inspectorToolSettings']['pencil']
) {
  const label = translate('editor.compact.color');

  return (
    <ColorField
      title={label}
      label={label}
      {...buildBrushColorControlProps('pencil', props, settings, props.shapeStrokePalette)}
    />
  );
}

function renderPencilWidthPanel(
  props: BrushControlsProps,
  settings: BrushControlsProps['inspectorToolSettings']['pencil']
) {
  const label = translate('editor.compact.width');

  return renderPencilRangePanel(props, {
    label,
    max: 20,
    min: 1,
    onChange: (width) => props.previewBrushPatch('pencil', { width }),
    value: settings.width,
    valueText: `${settings.width}px`,
  });
}

function renderPencilOpacityPanel(
  props: BrushControlsProps,
  settings: BrushControlsProps['inspectorToolSettings']['pencil']
) {
  const label = translate('editor.compact.opacity');

  return renderPencilRangePanel(props, {
    label,
    max: 1,
    min: 0.05,
    onChange: (opacity) => props.previewBrushPatch('pencil', { opacity }),
    step: 0.05,
    value: settings.opacity,
    valueText: `${Math.round(settings.opacity * 100)}%`,
  });
}

function renderPencilHeaderTogglePanel(options: {
  active: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <HeaderValueToggleSection
      active={options.active}
      label={options.label}
      value={translate(
        options.active ? 'editor.compact.enabledShort' : 'editor.compact.disabledShort'
      )}
      onToggle={options.onToggle}
    />
  );
}

function renderPencilDynamicWidthPanel(props: BrushControlsProps) {
  const label = translate('editor.compact.dynamicWidth');
  const enabled = props.inspectorToolSettings.pencil.dynamicWidth !== false;

  return renderPencilHeaderTogglePanel({
    active: enabled,
    label,
    onToggle: () => props.applyBrushPatch('pencil', { dynamicWidth: !enabled }),
  });
}

function renderPencilSmoothingPanel(
  props: BrushControlsProps,
  settings: BrushControlsProps['inspectorToolSettings']['pencil']
) {
  const label = translate('editor.compact.smoothingLevel');
  const enabled = settings.smoothingLevel > 0;

  return renderPencilHeaderTogglePanel({
    active: enabled,
    label,
    onToggle: () => props.applyBrushPatch('pencil', { smoothingLevel: enabled ? 0 : 10 }),
  });
}

function renderPencilShadowSizePanel(
  props: BrushControlsProps,
  settings: BrushControlsProps['inspectorToolSettings']['pencil']
) {
  return (
    <ShadowRangeSection
      label={translate('editor.compact.shadowSize')}
      value={settings.shadow}
      onChange={(shadow) => props.previewBrushPatch('pencil', { shadow })}
      onValueCommit={props.commitPendingSelectionSettings}
    />
  );
}

function renderPencilShadowColorPanel(
  props: BrushControlsProps,
  settings: BrushControlsProps['inspectorToolSettings']['pencil']
) {
  const colorHandlers = createEditorColorPatchHandlers({
    applyPatch: (patch: { shadowColor: string }) => props.applyBrushPatch('pencil', patch),
    createPatch: (shadowColor: string) => ({ shadowColor }),
    previewColor: props.previewColor,
    updateColor: props.updateColor,
  });
  const label = translate('editor.compact.color');
  const shadowColor = settings.shadowColor ?? settings.color;

  return (
    <ColorField
      title={label}
      label={label}
      value={shadowColor}
      recentColors={props.recentColors}
      palette={props.shapeStrokePalette}
      {...colorHandlers}
    />
  );
}

function renderPencilShadowDirectionPanel(
  props: BrushControlsProps,
  settings: BrushControlsProps['inspectorToolSettings']['pencil']
) {
  const shadowAngle = settings.shadowAngle ?? 90;

  return (
    <ShadowAngleSection
      value={shadowAngle}
      onChange={(shadowAngle) => props.previewBrushPatch('pencil', { shadowAngle })}
      onValueCommit={props.commitPendingSelectionSettings}
    />
  );
}

function renderPencilShadowDistancePanel(
  props: BrushControlsProps,
  settings: BrushControlsProps['inspectorToolSettings']['pencil']
) {
  return (
    <ShadowDistanceSection
      value={settings.shadowDistance ?? 4}
      onChange={(shadowDistance) => props.previewBrushPatch('pencil', { shadowDistance })}
      onValueCommit={props.commitPendingSelectionSettings}
    />
  );
}

function renderPencilShadowBlurPanel(
  props: BrushControlsProps,
  settings: BrushControlsProps['inspectorToolSettings']['pencil']
) {
  return (
    <ShadowBlurSection
      value={settings.shadowBlur ?? 12}
      onChange={(shadowBlur) => props.previewBrushPatch('pencil', { shadowBlur })}
      onValueCommit={props.commitPendingSelectionSettings}
    />
  );
}

export function renderPencilControlsSection(props: BrushControlsProps) {
  const settings = props.inspectorToolSettings.pencil;

  return [
    <CollapsibleSection key="line" label={translate('editor.compact.lineGroup')}>
      <div className="space-y-3">
        {renderPencilWidthPanel(props, settings)}
        {renderPencilColorPanel(props, settings)}
        {renderPencilOpacityPanel(props, settings)}
        {renderPencilDynamicWidthPanel(props)}
        {renderPencilSmoothingPanel(props, settings)}
      </div>
    </CollapsibleSection>,
    <CollapsibleSection key="shadow" label={translate('highlighter.editor.shadowLabel')}>
      <div className="space-y-3">
        {renderPencilShadowSizePanel(props, settings)}
        {renderPencilShadowColorPanel(props, settings)}
        {renderPencilShadowDirectionPanel(props, settings)}
        {renderPencilShadowDistancePanel(props, settings)}
        {renderPencilShadowBlurPanel(props, settings)}
      </div>
    </CollapsibleSection>,
  ];
}
