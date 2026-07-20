import { translate } from '../../../../platform/i18n';
import { SelectField } from '../../../chrome/ui';
import { EditorInspectorPresetHeader } from '../../presets';
import { ToolColorSection } from '../color-section';
import {
  type InspectorNumericRowOptions,
  renderInspectorNumericRow,
  resolveInspectorNumericUnit,
} from '../numeric-row-section';
import { CollapsibleSection, PanelSection } from '../sections';
import { SegmentedRow } from '../segmented-row';
import {
  ShadowAngleSection,
  ShadowBlurSection,
  ShadowDistanceSection,
  ShadowRangeSection,
} from '../shadow';
import { renderLineFillSection } from './fill';
import type { LineControlsProps, LineSettings } from './types';

function renderLineRangeSection(props: LineControlsProps, options: InspectorNumericRowOptions) {
  return renderInspectorNumericRow({
    ...options,
    commit: props.commitPendingSelectionSettings,
    unit: resolveInspectorNumericUnit(options.valueText, { degree: true }),
  });
}

function renderLineColorSection(props: LineControlsProps, settings: LineSettings) {
  return (
    <ToolColorSection
      titleKey="editor.compact.lineColor"
      value={settings.color}
      recentColors={props.recentColors}
      palette={props.shapeStrokePalette}
      applyPatch={props.applyLinePatch}
      createPatch={(color: string) => ({ color })}
      previewColor={props.previewColor}
      updateColor={props.updateColor}
    />
  );
}

function renderLineWidthSection(props: LineControlsProps, settings: LineSettings) {
  return renderLineRangeSection(props, {
    ariaLabel: translate('editor.compact.lineWidth'),
    label: translate('editor.compact.width'),
    max: 48,
    min: 1,
    onChange: (width) => props.previewLinePatch({ width }),
    value: settings.width,
    valueText: `${settings.width}px`,
  });
}

function renderLineStyleSection(props: LineControlsProps, settings: LineSettings) {
  const label = translate('editor.compact.lineStyle');
  return (
    <SelectField
      label={label}
      value={settings.style}
      onChange={(style) => props.applyLinePatch({ style })}
      options={props.lineStyleOptions}
    />
  );
}

function renderLineCornerSection(props: LineControlsProps, settings: LineSettings) {
  const label = translate('editor.compact.lineCorners');
  return (
    <PanelSection label={label}>
      <SegmentedRow
        ariaLabel={label}
        value={settings.corners}
        onChange={(corners) => props.applyLinePatch({ corners })}
        options={props.lineCornerOptions}
        columns={2}
      />
    </PanelSection>
  );
}

function renderLineRoughnessSection(props: LineControlsProps, settings: LineSettings) {
  return renderLineRangeSection(props, {
    label: translate('editor.compact.roughness'),
    max: 3,
    min: 0,
    onChange: (roughness) => props.previewLinePatch({ roughness }),
    step: 0.1,
    value: settings.roughness,
    valueText: String(settings.roughness),
  });
}

function renderLineBowingSection(props: LineControlsProps, settings: LineSettings) {
  const value = settings.bowing ?? 0;
  return renderLineRangeSection(props, {
    label: translate('editor.compact.bowing'),
    max: 3,
    min: 0,
    onChange: (bowing) => props.previewLinePatch({ bowing }),
    step: 0.1,
    value,
    valueText: String(value),
  });
}

function renderLineOpacitySection(props: LineControlsProps, settings: LineSettings) {
  const percent = Math.round(settings.opacity * 100);
  return renderLineRangeSection(props, {
    label: translate('editor.compact.opacity'),
    max: 100,
    min: 0,
    onChange: (opacity) => props.previewLinePatch({ opacity: opacity / 100 }),
    value: percent,
    valueText: `${percent}%`,
  });
}

function renderLineShadowColorSection(props: LineControlsProps, settings: LineSettings) {
  return (
    <ToolColorSection
      titleKey="editor.compact.color"
      value={settings.shadowColor ?? settings.color}
      recentColors={props.recentColors}
      palette={props.shapeStrokePalette}
      applyPatch={props.applyLinePatch}
      createPatch={(shadowColor: string) => ({ shadowColor })}
      previewColor={props.previewColor}
      updateColor={props.updateColor}
    />
  );
}

function renderLineShadowDirectionSection(props: LineControlsProps, settings: LineSettings) {
  const shadowAngle = settings.shadowAngle ?? 90;
  return (
    <ShadowAngleSection
      value={shadowAngle}
      onChange={(shadowAngle) => props.previewLinePatch({ shadowAngle })}
      onValueCommit={props.commitPendingSelectionSettings}
    />
  );
}

function renderLineShadowDistanceSection(props: LineControlsProps, settings: LineSettings) {
  return (
    <ShadowDistanceSection
      value={settings.shadowDistance ?? 4}
      onChange={(shadowDistance) => props.previewLinePatch({ shadowDistance })}
      onValueCommit={props.commitPendingSelectionSettings}
    />
  );
}

function renderLineShadowBlurSection(props: LineControlsProps, settings: LineSettings) {
  return (
    <ShadowBlurSection
      value={settings.shadowBlur ?? 12}
      onChange={(shadowBlur) => props.previewLinePatch({ shadowBlur })}
      onValueCommit={props.commitPendingSelectionSettings}
    />
  );
}

function renderLineSection(props: LineControlsProps, settings: LineSettings) {
  return (
    <CollapsibleSection key="line" label={translate('editor.compact.lineGroup')}>
      <div className="space-y-3">
        {renderLineWidthSection(props, settings)}
        {renderLineStyleSection(props, settings)}
        {renderLineCornerSection(props, settings)}
        {renderLineRoughnessSection(props, settings)}
        {renderLineBowingSection(props, settings)}
        {renderLineColorSection(props, settings)}
        {renderLineOpacitySection(props, settings)}
      </div>
    </CollapsibleSection>
  );
}

function renderLineFillGroup(props: LineControlsProps, settings: LineSettings) {
  return (
    <CollapsibleSection key="fill" label={translate('editor.compact.lineFill')} defaultOpen={false}>
      {renderLineFillSection(props, settings)}
    </CollapsibleSection>
  );
}

function renderLineShadowSection(props: LineControlsProps, settings: LineSettings) {
  return (
    <CollapsibleSection
      key="shadow"
      label={translate('highlighter.editor.shadowLabel')}
      defaultOpen={false}
    >
      <div className="space-y-3">
        <ShadowRangeSection
          label={translate('editor.compact.shadowSize')}
          value={settings.shadow}
          onChange={(shadow) => props.previewLinePatch({ shadow })}
          onValueCommit={props.commitPendingSelectionSettings}
        />
        {renderLineShadowColorSection(props, settings)}
        {renderLineShadowDirectionSection(props, settings)}
        {renderLineShadowDistanceSection(props, settings)}
        {renderLineShadowBlurSection(props, settings)}
      </div>
    </CollapsibleSection>
  );
}

export function renderLineControlsSection(props: LineControlsProps) {
  const settings = props.inspectorToolSettings.line;
  const controls = [
    renderLineSection(props, settings),
    renderLineFillGroup(props, settings),
    renderLineShadowSection(props, settings),
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
