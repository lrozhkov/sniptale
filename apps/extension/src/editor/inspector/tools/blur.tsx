import { translate } from '../../../platform/i18n';
import type { BlurSettings } from '../../../features/highlighter/contracts';
import { ColorField, NumericRow, SelectField } from '../../chrome/ui';
import { EditorInspectorPresetHeader } from '../presets';
import { CollapsibleSection } from './sections';
import type { EditorInspectorToolsPanelProps } from './types';
import { resolveBlurBorderSettings } from './blur-shared';
import { buildShapeColorControlProps } from './brush-shape-sections/shared';

type BlurControlsProps = Pick<
  EditorInspectorToolsPanelProps,
  | 'applyBlurPatch'
  | 'blurTypeOptions'
  | 'commitPendingSelectionSettings'
  | 'inspectorToolSettings'
  | 'lineStyleOptions'
  | 'previewColor'
  | 'previewBlurPatch'
  | 'recentColors'
  | 'shapeStrokePalette'
  | 'toNumber'
  | 'toolPresetHeader'
  | 'updateColor'
>;

function renderBlurAmountSection(props: BlurControlsProps) {
  const settings = props.inspectorToolSettings.blur;
  const label = translate('editor.compact.blurAmount');

  return (
    <NumericRow
      label={label}
      min={1}
      max={24}
      step={1}
      value={settings.amount}
      scrub={{ min: 1, max: 24, step: 1 }}
      onPreviewValue={(amount) => props.previewBlurPatch({ amount })}
      onCommitValue={(amount) => {
        props.previewBlurPatch({ amount });
        props.commitPendingSelectionSettings();
      }}
    />
  );
}

function renderBlurTypeSection(props: BlurControlsProps) {
  const label = translate('editor.compact.blurEffect');

  return (
    <SelectField
      label={label}
      value={props.inspectorToolSettings.blur.blurType}
      onChange={(blurType) => props.applyBlurPatch({ blurType })}
      options={props.blurTypeOptions}
    />
  );
}

function renderBlurStrokeColorSection(props: BlurControlsProps, settings: BlurSettings) {
  const borderSettings = resolveBlurBorderSettings(settings);
  const label = translate('editor.compact.color');

  return (
    <ColorField
      title={label}
      label={label}
      {...buildShapeColorControlProps(
        borderSettings.strokeColor,
        props.recentColors,
        (color) =>
          props.updateColor((next: string) => props.applyBlurPatch({ strokeColor: next }), color),
        (color) =>
          props.previewColor((next: string) => props.applyBlurPatch({ strokeColor: next }), color),
        props.shapeStrokePalette
      )}
    />
  );
}

function renderBlurStrokeWidthSection(props: BlurControlsProps, settings: BlurSettings) {
  const borderSettings = resolveBlurBorderSettings(settings);
  const label = translate('editor.compact.width');

  return (
    <NumericRow
      label={label}
      min={0}
      max={24}
      step={1}
      unit="px"
      value={borderSettings.strokeWidth}
      scrub={{ min: 0, max: 24, step: 1 }}
      onPreviewValue={(strokeWidth) =>
        props.previewBlurPatch({ showBorder: strokeWidth > 0, strokeWidth })
      }
      onCommitValue={(strokeWidth) => {
        props.previewBlurPatch({ showBorder: strokeWidth > 0, strokeWidth });
        props.commitPendingSelectionSettings();
      }}
    />
  );
}

function renderBlurStrokeStyleSection(props: BlurControlsProps, settings: BlurSettings) {
  const borderSettings = resolveBlurBorderSettings(settings);
  const label = translate('highlighter.editor.styleLabel');

  return (
    <SelectField
      label={label}
      value={borderSettings.strokeStyle}
      onChange={(strokeStyle) => props.applyBlurPatch({ strokeStyle })}
      options={props.lineStyleOptions}
    />
  );
}

function renderBlurRadiusSection(props: BlurControlsProps, settings: BlurSettings) {
  const borderSettings = resolveBlurBorderSettings(settings);
  const label = translate('editor.compact.cornerRadius');

  return (
    <NumericRow
      label={label}
      min={0}
      max={50}
      step={1}
      unit="px"
      value={borderSettings.radius}
      scrub={{ min: 0, max: 50, step: 1 }}
      onPreviewValue={(radius) => props.previewBlurPatch({ radius })}
      onCommitValue={(radius) => {
        props.previewBlurPatch({ radius });
        props.commitPendingSelectionSettings();
      }}
    />
  );
}

function renderBlurStrokeOpacitySection(props: BlurControlsProps, settings: BlurSettings) {
  const borderSettings = resolveBlurBorderSettings(settings);
  const label = translate('editor.compact.opacity');

  return (
    <NumericRow
      label={label}
      min={0}
      max={100}
      step={5}
      unit="%"
      value={Math.round(borderSettings.strokeOpacity * 100)}
      scrub={{ min: 0, max: 100, step: 5 }}
      onPreviewValue={(strokeOpacity) =>
        props.previewBlurPatch({ strokeOpacity: strokeOpacity / 100 })
      }
      onCommitValue={(strokeOpacity) => {
        props.previewBlurPatch({ strokeOpacity: strokeOpacity / 100 });
        props.commitPendingSelectionSettings();
      }}
    />
  );
}

export function renderBlurControlsSection(props: BlurControlsProps) {
  const settings = props.inspectorToolSettings.blur;
  const controls = [
    <CollapsibleSection key="area" label={translate('editor.compact.blurArea')}>
      <div className="space-y-3">
        {renderBlurTypeSection(props)}
        {renderBlurAmountSection(props)}
        {renderBlurRadiusSection(props, settings)}
      </div>
    </CollapsibleSection>,
    <CollapsibleSection key="frame" label={translate('editor.compact.blurBorder')}>
      <div className="space-y-3">
        {renderBlurStrokeWidthSection(props, settings)}
        {renderBlurStrokeStyleSection(props, settings)}
        {renderBlurStrokeColorSection(props, settings)}
        {renderBlurStrokeOpacitySection(props, settings)}
      </div>
    </CollapsibleSection>,
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
