import { useRef } from 'react';
import { getColorAlpha, multiplyColorAlpha, setColorAlpha } from '@sniptale/foundation/color';
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

function patchSourceImage(
  props: Pick<
    EditorInspectorFrameSourceImageFieldsProps,
    'applyFramePatch' | 'previewFramePatch' | 'frameDraft'
  >,
  patch: Partial<EditorImageSettings>,
  preview = false
) {
  const apply = preview ? props.previewFramePatch : props.applyFramePatch;
  apply?.({
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
  onPreview?: ((value: number) => void) | undefined;
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
      onPreview={
        props.onPreview
          ? (nextValue) => props.onPreview?.(percent ? nextValue / 100 : nextValue)
          : undefined
      }
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
    <div className="sniptale-parameter-stack">
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
    <div className="sniptale-parameter-stack" data-ui="editor.frame.source-basics">
      <SourceImageRangeSection
        label={translate('editor.compact.cornerRadius')}
        max={80}
        value={settings.radius}
        valueText={`${settings.radius}px`}
        onPreview={
          props.previewFramePatch
            ? (radius) => patchSourceImage(props, { radius }, true)
            : undefined
        }
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
    <div className="sniptale-parameter-stack">
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
    <section className="sniptale-parameter-stack" data-ui="editor.frame.source-glow">
      <SourceImageRangeControl
        label={translate('editor.scene.glowSize')}
        max={100}
        value={settings.shadow}
        valueText={`${settings.shadow}%`}
        onPreview={
          props.previewFramePatch
            ? (shadow) => patchSourceImage(props, { shadow }, true)
            : undefined
        }
        onChange={(shadow) => patchSourceImage(props, { shadow })}
      />
      <ColorField
        title={translate('editor.compact.shadowColor')}
        label={translate('editor.compact.shadowColor')}
        value={settings.shadowColor ?? settings.strokeColor}
        recentColors={props.recentColors}
        palette={props.shapeStrokePalette ?? []}
        onPreviewChange={(shadowColor) => patchSourceImage(props, { shadowColor }, true)}
        onPreviewReset={(shadowColor) => patchSourceImage(props, { shadowColor }, true)}
        onChange={(shadowColor) => patchSourceImage(props, { shadowColor })}
      />
    </section>
  );
}

function SourceImageBorderSection(args: {
  props: EditorInspectorFrameSourceImageFieldsProps;
  settings: EditorImageSettings;
}) {
  const { props, settings } = args;
  return (
    <section className="sniptale-parameter-stack" data-ui="editor.frame.source-border">
      <EditorInspectorDetails
        preferenceId="frame:source-image-border"
        level="group"
        label={translate('editor.scene.borderAdvanced')}
      >
        <div className="sniptale-parameter-stack">
          <SourceImageRangeControl
            label={translate('editor.compact.blurStrokeWidth')}
            max={24}
            value={settings.strokeWidth}
            valueText={`${settings.strokeWidth}px`}
            onPreview={
              props.previewFramePatch
                ? (strokeWidth) => patchSourceImage(props, { strokeWidth }, true)
                : undefined
            }
            onChange={(strokeWidth) => patchSourceImage(props, { strokeWidth })}
          />
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
  const original = useRef<Pick<EditorImageSettings, 'strokeColor' | 'strokeOpacity'> | null>(null);
  const patchColor = (color: string, preview = false) =>
    patchSourceImage(
      props,
      {
        strokeColor: setColorAlpha(color, 1) ?? color,
        strokeOpacity: getColorAlpha(color) ?? 1,
      },
      preview
    );
  return (
    <ColorField
      title={translate('editor.compact.color')}
      label={translate('editor.compact.color')}
      value={
        multiplyColorAlpha(settings.strokeColor, settings.strokeOpacity) ?? settings.strokeColor
      }
      recentColors={props.recentColors}
      palette={props.shapeStrokePalette ?? []}
      onOpenChange={(open) => {
        if (open)
          original.current ??= {
            strokeColor: settings.strokeColor,
            strokeOpacity: settings.strokeOpacity,
          };
        else original.current = null;
      }}
      onPreviewChange={(color) => patchColor(color, true)}
      onPreviewReset={() =>
        patchSourceImage(
          props,
          original.current ?? {
            strokeColor: settings.strokeColor,
            strokeOpacity: settings.strokeOpacity,
          },
          true
        )
      }
      onChange={(color) => patchColor(color)}
    />
  );
}

interface EditorInspectorFrameSourceImageFieldsProps {
  previewFramePatch?: ((patch: Partial<EditorFrameSettings>) => void) | undefined;
  applyFramePatch: (patch: Partial<EditorFrameSettings>) => void;
  frameDraft: EditorFrameSettings;
  lineStyleOptions?: CompactSelectOption<EditorImageSettings['strokeStyle']>[] | undefined;
  recentColors: string[];
  shapeStrokePalette?: readonly string[] | undefined;
}
