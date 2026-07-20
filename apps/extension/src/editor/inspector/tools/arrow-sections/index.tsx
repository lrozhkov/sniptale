import { translate } from '../../../../platform/i18n';
import { SelectField } from '../../../chrome/ui';
import { EditorInspectorPresetHeader } from '../../presets';
import { ToolColorSection } from '../color-section';
import { type InspectorNumericRowOptions, renderInspectorNumericRow } from '../numeric-row-section';
import { CollapsibleSection, HeaderValueToggleSection } from '../sections';
import { renderArrowHeadSections } from './heads';
import { renderArrowShadowSection } from './shadow';
import type { ArrowControlsProps, ArrowSettings } from './types';

function renderArrowRangeSection(props: ArrowControlsProps, options: InspectorNumericRowOptions) {
  return renderInspectorNumericRow({
    ...options,
    commit: props.commitPendingSelectionSettings,
  });
}

function renderArrowTypeSection(props: ArrowControlsProps, settings: ArrowSettings) {
  const label = translate('editor.compact.arrowType');

  return (
    <SelectField
      label={label}
      value={settings.arrowType ?? 'sharp'}
      onChange={(arrowType) =>
        props.applyArrowPatch({
          arrowType,
          mode: arrowType === 'curved' ? 'curve' : 'straight',
        })
      }
      options={props.arrowTypeOptions}
    />
  );
}

function renderArrowWidthSection(props: ArrowControlsProps, settings: ArrowSettings) {
  return renderArrowRangeSection(props, {
    ariaLabel: translate('editor.compact.arrowWidth'),
    label: translate('editor.compact.width'),
    max: 36,
    min: 1,
    onChange: (width) => props.previewArrowPatch({ width }),
    value: settings.width,
    valueText: `${settings.width}px`,
  });
}

function renderArrowDynamicWidthSection(props: ArrowControlsProps, settings: ArrowSettings) {
  const enabled = settings.dynamicWidth !== false;

  return (
    <HeaderValueToggleSection
      active={enabled}
      label={translate('editor.compact.dynamicWidth')}
      value={translate(enabled ? 'editor.compact.enabledShort' : 'editor.compact.disabledShort')}
      onToggle={() => props.applyArrowPatch({ dynamicWidth: !enabled })}
    />
  );
}

function renderArrowStyleSection(props: ArrowControlsProps, settings: ArrowSettings) {
  const label = translate('editor.compact.lineStyle');
  return (
    <SelectField
      label={label}
      value={settings.style ?? 'solid'}
      onChange={(style) => props.applyArrowPatch({ style })}
      options={props.lineStyleOptions}
    />
  );
}

function renderArrowRoughnessSection(props: ArrowControlsProps, settings: ArrowSettings) {
  const value = settings.roughness ?? 0;
  return renderArrowRangeSection(props, {
    label: translate('editor.compact.roughness'),
    max: 3,
    min: 0,
    onChange: (roughness) => props.previewArrowPatch({ roughness }),
    step: 0.1,
    value,
    valueText: String(value),
  });
}

function renderArrowBowingSection(props: ArrowControlsProps, settings: ArrowSettings) {
  const value = settings.bowing ?? 0;
  return renderArrowRangeSection(props, {
    label: translate('editor.compact.bowing'),
    max: 3,
    min: 0,
    onChange: (bowing) => props.previewArrowPatch({ bowing }),
    step: 0.1,
    value,
    valueText: String(value),
  });
}

function renderArrowColorSection(props: ArrowControlsProps, settings: ArrowSettings) {
  return (
    <ToolColorSection
      titleKey="editor.compact.arrowColor"
      value={settings.color}
      recentColors={props.recentColors}
      palette={props.shapeStrokePalette}
      applyPatch={props.applyArrowPatch}
      createPatch={(color: string) => ({ color })}
      previewColor={props.previewColor}
      updateColor={props.updateColor}
    />
  );
}

function renderArrowOpacitySection(props: ArrowControlsProps, settings: ArrowSettings) {
  const percent = Math.round(settings.opacity * 100);
  return renderArrowRangeSection(props, {
    label: translate('editor.compact.opacity'),
    max: 100,
    min: 0,
    onChange: (opacity) => props.previewArrowPatch({ opacity: opacity / 100 }),
    value: percent,
    valueText: `${percent}%`,
  });
}

function renderArrowLineSection(props: ArrowControlsProps, settings: ArrowSettings) {
  return (
    <CollapsibleSection key="line" label={translate('editor.compact.lineGroup')}>
      <div className="space-y-3">
        {renderArrowWidthSection(props, settings)}
        {renderArrowDynamicWidthSection(props, settings)}
        {renderArrowStyleSection(props, settings)}
        {renderArrowRoughnessSection(props, settings)}
        {renderArrowBowingSection(props, settings)}
        {renderArrowColorSection(props, settings)}
        {renderArrowOpacitySection(props, settings)}
      </div>
    </CollapsibleSection>
  );
}

export function renderArrowControlsSection(props: ArrowControlsProps) {
  const settings = props.inspectorToolSettings.arrow;
  const controls = [
    renderArrowTypeSection(props, settings),
    renderArrowLineSection(props, settings),
    renderArrowHeadSections(props, settings),
    renderArrowShadowSection(props, settings),
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
