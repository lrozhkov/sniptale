import type { EditorFrameSettings } from '../../../features/editor/document/types';
import type { EditorImageSettings } from '../../../features/editor/document/image-types';
import { normalizeEditorImageSettings } from '../../../features/editor/document/constants';
import { translate } from '../../../platform/i18n';
import {
  ColorField,
  NumericRow,
  SelectField,
  type CompactSelectOption,
  type NumericRowProps,
} from '../../chrome/ui';
import { CollapsibleSection, PanelSection } from '../tools/sections';

const DEFAULT_SOURCE_IMAGE_LINE_STYLE_OPTIONS = [
  { label: translate('editor.compact.lineStyleSolid'), value: 'solid' },
  { label: translate('editor.compact.lineStyleDash'), value: 'dash' },
  { label: translate('editor.compact.lineStyleDot'), value: 'dot' },
] satisfies CompactSelectOption<EditorImageSettings['strokeStyle']>[];

function getPercentValue(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function patchSourceImage(
  props: Pick<EditorInspectorFrameSourceImageSectionProps, 'applyFramePatch' | 'frameDraft'>,
  patch: Partial<EditorImageSettings>
) {
  props.applyFramePatch({
    sourceImage: {
      ...normalizeEditorImageSettings(props.frameDraft.sourceImage),
      ...patch,
    },
  });
}

function SourceImageRangeControl(props: {
  label: string;
  max: number;
  min?: number;
  step?: number;
  value: number;
  valueText: string;
  onChange: (value: number) => void;
}) {
  const percent = props.valueText.endsWith('%');
  const min = props.min ?? 0;
  const value = percent ? Math.round(props.value * 100) : props.value;
  const step = percent ? Math.round((props.step ?? 0.05) * 100) : props.step;

  return (
    <NumericRow
      label={props.label}
      value={value}
      unit={resolveSourceImageNumericUnit(props.valueText)}
      min={percent ? Math.round(min * 100) : min}
      max={percent ? Math.round(props.max * 100) : props.max}
      step={step}
      onPreviewValue={(nextValue) => props.onChange(percent ? nextValue / 100 : nextValue)}
      onCommitValue={(nextValue) => props.onChange(percent ? nextValue / 100 : nextValue)}
      scrub={{
        min: percent ? Math.round(min * 100) : min,
        max: percent ? Math.round(props.max * 100) : props.max,
        step,
      }}
    />
  );
}

function SourceImageRangeSection(props: Parameters<typeof SourceImageRangeControl>[0]) {
  return <SourceImageRangeControl {...props} />;
}

function resolveSourceImageNumericUnit(valueText: string): NumericRowProps['unit'] {
  if (valueText.endsWith('%')) {
    return '%';
  }

  if (valueText.endsWith('°')) {
    return 'deg';
  }

  if (valueText.endsWith('px')) {
    return 'px';
  }

  return '';
}

export function EditorInspectorFrameSourceImageSection(
  props: EditorInspectorFrameSourceImageSectionProps
) {
  const settings = normalizeEditorImageSettings(props.frameDraft.sourceImage);

  return (
    <CollapsibleSection label={translate('editor.runtime.sourceImage')} defaultOpen={false}>
      <div className="space-y-3 pt-3">
        <SourceImageRangeSection
          label={translate('editor.compact.opacity')}
          max={1}
          step={0.05}
          value={settings.opacity}
          valueText={getPercentValue(settings.opacity)}
          onChange={(opacity) => patchSourceImage(props, { opacity })}
        />
        <SourceImageRangeSection
          label={translate('editor.compact.cornerRadius')}
          max={80}
          value={settings.radius}
          valueText={`${settings.radius}px`}
          onChange={(radius) => patchSourceImage(props, { radius })}
        />
        <SourceImageShadowSection props={props} settings={settings} />
        <SourceImageBorderSection props={props} settings={settings} />
      </div>
    </CollapsibleSection>
  );
}

function SourceImageShadowSection(args: {
  props: EditorInspectorFrameSourceImageSectionProps;
  settings: EditorImageSettings;
}) {
  const { props, settings } = args;
  return (
    <PanelSection label={translate('highlighter.editor.shadowLabel')}>
      <div className="space-y-3">
        <SourceImageRangeControl
          label={translate('editor.compact.shadowSize')}
          max={100}
          value={settings.shadow}
          valueText={`${settings.shadow}%`}
          onChange={(shadow) => patchSourceImage(props, { shadow })}
        />
        <ColorField
          title={translate('highlighter.editor.shadowLabel')}
          label={translate('editor.compact.shadowColor')}
          value={settings.shadowColor ?? settings.strokeColor}
          recentColors={props.recentColors}
          palette={props.shapeStrokePalette ?? []}
          onChange={(shadowColor) => patchSourceImage(props, { shadowColor })}
          onPreviewChange={(shadowColor) => patchSourceImage(props, { shadowColor })}
          onPreviewReset={(shadowColor) => patchSourceImage(props, { shadowColor })}
        />
        <SourceImageShadowGeometry props={props} settings={settings} />
      </div>
    </PanelSection>
  );
}

function SourceImageShadowGeometry(args: {
  props: EditorInspectorFrameSourceImageSectionProps;
  settings: EditorImageSettings;
}) {
  const { props, settings } = args;
  return (
    <>
      <SourceImageRangeControl
        label={translate('editor.compact.shadowAngle')}
        max={360}
        value={settings.shadowAngle ?? 90}
        valueText={`${Math.round(settings.shadowAngle ?? 90)}°`}
        onChange={(shadowAngle) => patchSourceImage(props, { shadowAngle })}
      />
      <SourceImageRangeControl
        label={translate('editor.compact.shadowDistance')}
        max={64}
        value={settings.shadowDistance ?? 4}
        valueText={`${Math.round(settings.shadowDistance ?? 4)}px`}
        onChange={(shadowDistance) => patchSourceImage(props, { shadowDistance })}
      />
      <SourceImageRangeControl
        label={translate('editor.compact.shadowBlur')}
        max={64}
        value={settings.shadowBlur ?? 12}
        valueText={`${Math.round(settings.shadowBlur ?? 12)}px`}
        onChange={(shadowBlur) => patchSourceImage(props, { shadowBlur })}
      />
    </>
  );
}

function SourceImageBorderSection(args: {
  props: EditorInspectorFrameSourceImageSectionProps;
  settings: EditorImageSettings;
}) {
  const { props, settings } = args;
  return (
    <PanelSection label={translate('editor.compact.blurBorder')}>
      <div className="space-y-3">
        <SelectField
          label={translate('highlighter.editor.styleLabel')}
          value={settings.strokeStyle}
          onChange={(strokeStyle: EditorImageSettings['strokeStyle']) =>
            patchSourceImage(props, { strokeStyle })
          }
          options={props.lineStyleOptions ?? DEFAULT_SOURCE_IMAGE_LINE_STYLE_OPTIONS}
        />
        <SourceImageRangeControl
          label={translate('editor.compact.blurStrokeWidth')}
          max={24}
          value={settings.strokeWidth}
          valueText={`${settings.strokeWidth}px`}
          onChange={(strokeWidth) => patchSourceImage(props, { strokeWidth })}
        />
        <SourceImageBorderColor props={props} settings={settings} />
      </div>
    </PanelSection>
  );
}

function SourceImageBorderColor(args: {
  props: EditorInspectorFrameSourceImageSectionProps;
  settings: EditorImageSettings;
}) {
  const { props, settings } = args;
  return (
    <>
      <ColorField
        title={translate('editor.compact.color')}
        label={translate('editor.compact.color')}
        value={settings.strokeColor}
        recentColors={props.recentColors}
        palette={props.shapeStrokePalette ?? []}
        onChange={(strokeColor) => patchSourceImage(props, { strokeColor })}
        onPreviewChange={(strokeColor) => patchSourceImage(props, { strokeColor })}
        onPreviewReset={(strokeColor) => patchSourceImage(props, { strokeColor })}
      />
      <SourceImageRangeControl
        label={translate('editor.compact.opacity')}
        max={1}
        step={0.05}
        value={settings.strokeOpacity}
        valueText={getPercentValue(settings.strokeOpacity)}
        onChange={(strokeOpacity) => patchSourceImage(props, { strokeOpacity })}
      />
    </>
  );
}

interface EditorInspectorFrameSourceImageSectionProps {
  applyFramePatch: (patch: Partial<EditorFrameSettings>) => void;
  frameDraft: EditorFrameSettings;
  lineStyleOptions?: CompactSelectOption<EditorImageSettings['strokeStyle']>[] | undefined;
  recentColors: string[];
  shapeStrokePalette?: readonly string[] | undefined;
}
