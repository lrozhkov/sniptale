import { translate } from '../../../platform/i18n';
import { resolveEditorStepSettingsPatch } from '../../objects/step-tool/value';
import { ColorField, SelectField } from '../../chrome/ui';
import { EditorInspectorPresetHeader } from '../presets';
import type { EditorToolSettings } from '../../../features/editor/document/tool-settings-types';
import type { EditorInspectorToolsPanelProps } from './types';
import { createEditorColorPatchHandlers } from './color-actions';
import { type InspectorNumericRowOptions, renderInspectorNumericRow } from './numeric-row-section';
import { CollapsibleSection, PanelSection } from './sections';
import { StepValueInput } from './step-value-input';

type StepSettings = EditorToolSettings['step'];
type StepControlsProps = Pick<
  EditorInspectorToolsPanelProps,
  | 'applyStepPatch'
  | 'commitPendingSelectionSettings'
  | 'inspectorToolSettings'
  | 'previewColor'
  | 'previewStepPatch'
  | 'recentColors'
  | 'shapeStrokePalette'
  | 'stepAlphabetOptions'
  | 'stepTypeOptions'
  | 'textColorPalette'
  | 'toNumber'
  | 'toolPresetHeader'
  | 'updateColor'
>;

function renderStepTypeSection(props: StepControlsProps, settings: StepSettings) {
  const label = translate('editor.compact.stepType');
  return (
    <SelectField
      key="type"
      label={label}
      value={settings.type}
      onChange={(value) =>
        props.applyStepPatch(resolveEditorStepSettingsPatch(settings, { type: value }))
      }
      options={props.stepTypeOptions}
    />
  );
}

function renderStepValueSection(props: StepControlsProps, settings: StepSettings) {
  return (
    <PanelSection key="value" label={translate('editor.compact.stepValue')}>
      <StepValueInput
        settings={settings}
        previewStepPatch={props.previewStepPatch}
        commitPendingSelectionSettings={props.commitPendingSelectionSettings}
      />
    </PanelSection>
  );
}

function renderStepAlphabetSection(props: StepControlsProps, settings: StepSettings) {
  if (settings.type !== 'letter') {
    return null;
  }

  const label = translate('editor.compact.alphabet');
  return (
    <SelectField
      key="alphabet"
      label={label}
      value={settings.alphabet}
      onChange={(value) =>
        props.applyStepPatch(resolveEditorStepSettingsPatch(settings, { alphabet: value }))
      }
      options={props.stepAlphabetOptions}
    />
  );
}

function renderStepRangeSection(props: StepControlsProps, options: InspectorNumericRowOptions) {
  return renderInspectorNumericRow({
    ...options,
    commit: props.commitPendingSelectionSettings,
    scalePercent: true,
  });
}

function renderStepColorSection(
  props: StepControlsProps,
  options: {
    createPatch: (color: string) => Partial<StepSettings>;
    key: string;
    palette: readonly string[];
    titleKey: Parameters<typeof translate>[0];
    value: string;
  }
) {
  const title = translate(options.titleKey);
  const colorHandlers = createEditorColorPatchHandlers({
    applyPatch: props.applyStepPatch,
    createPatch: options.createPatch,
    previewColor: props.previewColor,
    updateColor: props.updateColor,
  });

  return (
    <ColorField
      key={options.key}
      title={title}
      label={title}
      value={options.value}
      recentColors={props.recentColors}
      palette={options.palette}
      {...colorHandlers}
    />
  );
}

function renderStepTextGroup(props: StepControlsProps, settings: StepSettings) {
  return (
    <CollapsibleSection key="text" label={translate('editor.compact.stepTextGroup')}>
      <div className="space-y-3 pt-3">
        {renderStepTypeSection(props, settings)}
        {renderStepValueSection(props, settings)}
        {renderStepAlphabetSection(props, settings)}
        {renderStepColorSection(props, {
          key: 'textColor',
          titleKey: 'editor.compact.stepTextColor',
          value: settings.textColor,
          palette: props.textColorPalette,
          createPatch: (textColor: string) => ({ textColor }),
        })}
      </div>
    </CollapsibleSection>
  );
}

function renderStepShapeGroup(props: StepControlsProps, settings: StepSettings) {
  return (
    <CollapsibleSection key="shape" label={translate('editor.compact.stepShapeGroup')}>
      <div className="space-y-3 pt-3">
        {renderStepRangeSection(props, {
          key: 'size',
          ariaLabel: translate('editor.compact.stepSize'),
          label: translate('editor.compact.size'),
          min: 0,
          max: 20,
          step: 1,
          value: settings.sizeLevel,
          valueText: String(settings.sizeLevel),
          onChange: (sizeLevel) =>
            props.previewStepPatch({
              sizeLevel: sizeLevel as typeof settings.sizeLevel,
            }),
        })}
        {renderStepColorSection(props, {
          key: 'shapeColor',
          titleKey: 'editor.compact.stepShapeColor',
          value: settings.color,
          palette: props.shapeStrokePalette,
          createPatch: (color: string) => ({ color }),
        })}
        {renderStepRangeSection(props, {
          key: 'opacity',
          label: translate('editor.compact.opacity'),
          min: 0,
          max: 1,
          step: 0.05,
          value: settings.opacity,
          valueText: `${Math.round(settings.opacity * 100)}%`,
          onChange: (opacity) => props.previewStepPatch({ opacity }),
        })}
      </div>
    </CollapsibleSection>
  );
}

function renderStepStrokeGroup(props: StepControlsProps, settings: StepSettings) {
  return (
    <CollapsibleSection key="stroke" label={translate('editor.compact.stepStrokeGroup')}>
      <div className="space-y-3 pt-3">
        {renderStepRangeSection(props, {
          key: 'strokeWidth',
          label: translate('editor.compact.stepStrokeWidth'),
          min: 0,
          max: 12,
          step: 1,
          value: settings.strokeWidth,
          valueText: `${settings.strokeWidth}px`,
          onChange: (strokeWidth) => props.previewStepPatch({ strokeWidth }),
        })}
        {renderStepColorSection(props, {
          key: 'strokeColor',
          titleKey: 'editor.compact.stepStrokeColor',
          value: settings.strokeColor,
          palette: props.shapeStrokePalette,
          createPatch: (strokeColor: string) => ({ strokeColor }),
        })}
        {renderStepRangeSection(props, {
          key: 'strokeOpacity',
          label: translate('editor.compact.opacity'),
          min: 0,
          max: 1,
          step: 0.05,
          value: settings.strokeOpacity,
          valueText: `${Math.round(settings.strokeOpacity * 100)}%`,
          onChange: (strokeOpacity) => props.previewStepPatch({ strokeOpacity }),
        })}
      </div>
    </CollapsibleSection>
  );
}

function renderStepGroups(props: StepControlsProps, settings: StepSettings) {
  return [
    renderStepTextGroup(props, settings),
    renderStepShapeGroup(props, settings),
    renderStepStrokeGroup(props, settings),
  ];
}

export function renderStepControlsSection(props: StepControlsProps) {
  const settings = props.inspectorToolSettings.step;
  const controls = renderStepGroups(props, settings);

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
