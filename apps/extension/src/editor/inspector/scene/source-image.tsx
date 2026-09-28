import type { EditorFrameSettings } from '../../../features/editor/document/types';
import type { EditorImageSettings } from '../../../features/editor/document/image-types';
import { normalizeEditorImageSettings } from '../../../features/editor/document/constants';
import { translate } from '../../../platform/i18n';
import { ColorField, SelectField, type CompactSelectOption } from '../../chrome/ui';
import { EditorInspectorDetails } from '../grouped';
import { EditorInspectorRangeField } from './shared';

const DEFAULT_SOURCE_IMAGE_LINE_STYLE_OPTIONS = [
  { label: translate('editor.compact.lineStyleSolid'), value: 'solid' },
  { label: translate('editor.compact.lineStyleDash'), value: 'dash' },
  { label: translate('editor.compact.lineStyleDot'), value: 'dot' },
] satisfies CompactSelectOption<EditorImageSettings['strokeStyle']>[];

function getPercentValue(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function patchSourceImage(
  props: Pick<EditorInspectorFrameSourceImageFieldsProps, 'applyFramePatch' | 'frameDraft'>,
  patch: Partial<EditorImageSettings>
) {
  props.applyFramePatch({
    sourceImage: {
      ...normalizeEditorImageSettings(props.frameDraft.sourceImage),
      ...patch,
      opacity: 1,
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
  fractionalPercent?: boolean;
  onChange: (value: number) => void;
}) {
  const percent = props.fractionalPercent ?? false;
  const min = props.min ?? 0;
  const value = percent ? Math.round(props.value * 100) : props.value;
  const step = percent ? Math.round((props.step ?? 0.05) * 100) : props.step;

  return (
    <EditorInspectorRangeField
      label={props.label}
      value={value}
      unit={resolveSourceImageNumericUnit(props.valueText)}
      min={percent ? Math.round(min * 100) : min}
      max={percent ? Math.round(props.max * 100) : props.max}
      {...(step === undefined ? {} : { step })}
      onChange={(nextValue) => props.onChange(percent ? nextValue / 100 : nextValue)}
    />
  );
}

function SourceImageRangeSection(props: Parameters<typeof SourceImageRangeControl>[0]) {
  return <SourceImageRangeControl {...props} />;
}

function resolveSourceImageNumericUnit(valueText: string): '' | '%' | 'deg' | 'px' {
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

export function EditorInspectorFrameSourceImageFields(
  props: EditorInspectorFrameSourceImageFieldsProps
) {
  return (
    <div className="space-y-3">
      <EditorInspectorFrameSourceImageBasics {...props} />
      <EditorInspectorFrameSourceImageEffects {...props} />
    </div>
  );
}

export function EditorInspectorFrameSourceImageBasics(
  props: EditorInspectorFrameSourceImageFieldsProps
) {
  const settings = normalizeEditorImageSettings(props.frameDraft.sourceImage);

  return (
    <div className="space-y-3" data-ui="editor.frame.source-basics">
      <SourceImageRangeSection
        label={translate('editor.compact.cornerRadius')}
        max={80}
        value={settings.radius}
        valueText={`${settings.radius}px`}
        onChange={(radius) => patchSourceImage(props, { radius })}
      />
    </div>
  );
}

export function EditorInspectorFrameSourceImageEffects(
  props: EditorInspectorFrameSourceImageFieldsProps
) {
  const settings = normalizeEditorImageSettings(props.frameDraft.sourceImage);
  return (
    <div className="space-y-4 border-t border-[var(--sniptale-color-border-soft)] pt-3">
      <SourceImageShadowSection props={props} settings={settings} />
      <SourceImageBorderSection props={props} settings={settings} />
    </div>
  );
}

function SourceImageShadowSection(args: {
  props: EditorInspectorFrameSourceImageFieldsProps;
  settings: EditorImageSettings;
}) {
  const { props, settings } = args;
  return (
    <section className="space-y-2.5" data-ui="editor.frame.source-glow">
      <h3 className="text-xs font-semibold text-[var(--sniptale-color-text-secondary)]">
        {translate('editor.scene.glowLabel')}
      </h3>
      <SourceImageRangeControl
        label={translate('editor.scene.glowSize')}
        max={100}
        value={settings.shadow}
        valueText={`${settings.shadow}%`}
        onChange={(shadow) => patchSourceImage(props, { shadow })}
      />
      <EditorInspectorDetails
        preferenceId="frame:source-image-shadow"
        level="group"
        label={translate('editor.scene.glowAdvanced')}
      >
        <div className="space-y-3">
          <ColorField
            title={translate('editor.scene.glowLabel')}
            label={translate('editor.compact.shadowColor')}
            value={settings.shadowColor ?? settings.strokeColor}
            recentColors={props.recentColors}
            palette={props.shapeStrokePalette ?? []}
            onChange={(shadowColor) => patchSourceImage(props, { shadowColor })}
            onPreviewChange={(shadowColor) => patchSourceImage(props, { shadowColor })}
            onPreviewReset={(shadowColor) => patchSourceImage(props, { shadowColor })}
          />
          <SourceImageRangeControl
            label={translate('editor.compact.shadowBlur')}
            max={128}
            value={settings.shadowBlur ?? 12}
            valueText={`${Math.round(settings.shadowBlur ?? 12)}px`}
            onChange={(shadowBlur) => patchSourceImage(props, { shadowBlur })}
          />
        </div>
      </EditorInspectorDetails>
    </section>
  );
}

function SourceImageBorderSection(args: {
  props: EditorInspectorFrameSourceImageFieldsProps;
  settings: EditorImageSettings;
}) {
  const { props, settings } = args;
  return (
    <section className="space-y-2.5" data-ui="editor.frame.source-border">
      <h3 className="text-xs font-semibold text-[var(--sniptale-color-text-secondary)]">
        {translate('editor.compact.blurBorder')}
      </h3>
      <SourceImageRangeControl
        label={translate('editor.compact.blurStrokeWidth')}
        max={24}
        value={settings.strokeWidth}
        valueText={`${settings.strokeWidth}px`}
        onChange={(strokeWidth) => patchSourceImage(props, { strokeWidth })}
      />
      <EditorInspectorDetails
        preferenceId="frame:source-image-border"
        level="group"
        label={translate('editor.scene.borderAdvanced')}
      >
        <div className="space-y-3">
          <SelectField
            label={translate('highlighter.editor.styleLabel')}
            value={settings.strokeStyle}
            onChange={(strokeStyle: EditorImageSettings['strokeStyle']) =>
              patchSourceImage(props, { strokeStyle })
            }
            options={props.lineStyleOptions ?? DEFAULT_SOURCE_IMAGE_LINE_STYLE_OPTIONS}
          />
          <SourceImageBorderColor props={props} settings={settings} />
        </div>
      </EditorInspectorDetails>
    </section>
  );
}

function SourceImageBorderColor(args: {
  props: EditorInspectorFrameSourceImageFieldsProps;
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
        fractionalPercent
        onChange={(strokeOpacity) => patchSourceImage(props, { strokeOpacity })}
      />
    </>
  );
}

interface EditorInspectorFrameSourceImageFieldsProps {
  applyFramePatch: (patch: Partial<EditorFrameSettings>) => void;
  frameDraft: EditorFrameSettings;
  lineStyleOptions?: CompactSelectOption<EditorImageSettings['strokeStyle']>[] | undefined;
  recentColors: string[];
  shapeStrokePalette?: readonly string[] | undefined;
}
