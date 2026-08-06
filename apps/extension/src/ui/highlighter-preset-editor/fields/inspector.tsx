import type {
  BorderVisualStyle,
  BorderVisualStylePatch,
} from '../../../features/highlighter/contracts';
import { Braces, Box, PaintBucket, Save, Sparkles, Square } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { translate } from '../../../platform/i18n';
import { CompactColorSelector } from '../../color-selector';
import { CategorizedInspector } from '@sniptale/ui/categorized-inspector';
import { HighlighterPresetPropertyField as PropertyField } from '../inspector-field';
import { EditorCompactRangeField } from './sections/compact-range-field';
import { CompactSelect } from '../../compact-inspector-controls';
import { BorderPaddingFields } from './sections/border-padding-fields';
import {
  editorNativeResizableTextareaClassName,
  editorResizeHandleClassName,
  editorTextareaClassName,
} from '../constants';
import { cloneBorderPresetEffects } from '@sniptale/runtime-contracts/highlighter/border-preset';
import { AVAILABLE_HIGHLIGHTER_BLUR_TYPES } from '../../../features/highlighter/blur-types';

const BORDER_PALETTE = [
  '#f97316',
  '#2563eb',
  '#16a34a',
  '#ef4444',
  '#8b5cf6',
  '#facc15',
  '#111827',
  '#f8fafc',
] as const;

type BorderInspectorSection = 'outline' | 'fill' | 'geometry' | 'effects' | 'css' | 'save';

type BorderStyleInspectorProps = {
  cssDraft: string;
  cssError: string | null;
  cssTextareaHeight?: number;
  onChange: (patch: BorderVisualStylePatch) => void;
  onCssDraftChange: (value: string) => void;
  onCssResizeStart?: (event: MouseEvent<HTMLDivElement>) => void;
  saveSection?: ReactNode;
  style: BorderVisualStyle;
};

function BorderColorField(props: {
  label: string;
  onChange: (color: string) => void;
  value: string;
}) {
  return (
    <PropertyField label={props.label}>
      <CompactColorSelector
        label={props.label}
        onChange={props.onChange}
        palette={BORDER_PALETTE}
        recentColors={[props.value]}
        title={props.label}
        value={props.value}
      />
    </PropertyField>
  );
}

function BorderOutlineSection(props: BorderStyleInspectorProps) {
  return (
    <div className="grid gap-3">
      <BorderColorField
        label={translate('highlighter.editor.borderColorLabel')}
        onChange={(color) => props.onChange({ color })}
        value={props.style.color}
      />
      <PropertyField label={translate('highlighter.editor.styleLabel')}>
        <CompactSelect
          appearance="plain"
          aria-label={translate('highlighter.editor.styleLabel')}
          onChange={(style) => props.onChange({ style })}
          options={[
            { label: translate('highlighter.editor.styleSolid'), value: 'solid' },
            { label: translate('highlighter.editor.styleDashed'), value: 'dashed' },
            { label: translate('highlighter.editor.styleDotted'), value: 'dotted' },
          ]}
          value={props.style.style}
        />
      </PropertyField>
      <EditorCompactRangeField
        displaySuffix="px"
        label={translate('highlighter.editor.widthLabel')}
        max={20}
        min={1}
        onChange={(width) => props.onChange({ width })}
        value={props.style.width}
      />
      <EditorCompactRangeField
        displaySuffix="%"
        label={translate('highlighter.editor.strokeOpacityLabel')}
        max={100}
        min={0}
        onChange={(strokeOpacity) => props.onChange({ strokeOpacity })}
        value={props.style.strokeOpacity}
      />
    </div>
  );
}

function BorderFillSection(props: BorderStyleInspectorProps) {
  return (
    <div className="grid gap-3">
      <BorderColorField
        label={translate('highlighter.editor.fillColorLabel')}
        onChange={(fillColor) => props.onChange({ fillColor })}
        value={props.style.fillColor}
      />
      <EditorCompactRangeField
        displaySuffix="%"
        label={translate('highlighter.editor.fillOpacityLabel')}
        max={100}
        min={0}
        onChange={(fillOpacity) => props.onChange({ fillOpacity })}
        value={props.style.fillOpacity}
      />
    </div>
  );
}

function BorderGeometrySection(props: BorderStyleInspectorProps) {
  return (
    <div className="grid gap-3">
      <EditorCompactRangeField
        displaySuffix="px"
        label={translate('highlighter.editor.radiusLabel')}
        max={50}
        min={0}
        onChange={(radius) => props.onChange({ radius })}
        value={props.style.radius}
      />
      <BorderPaddingFields
        onChange={(padding) => props.onChange({ padding })}
        padding={props.style.padding}
      />
    </div>
  );
}

function BorderEffectsSection(props: BorderStyleInspectorProps) {
  const effects = cloneBorderPresetEffects(props.style.effects);
  const blurTypeLabels = {
    gaussian: translate('highlighter.editor.blurTypeGaussian'),
    distortion: translate('highlighter.editor.blurTypeDistortion'),
    solid: translate('highlighter.editor.blurTypeSolid'),
  } satisfies Record<(typeof AVAILABLE_HIGHLIGHTER_BLUR_TYPES)[number], string>;
  return (
    <div className="grid gap-3">
      <EditorCompactRangeField
        displaySuffix="%"
        label={translate('highlighter.editor.shadowLabel')}
        max={100}
        min={0}
        onChange={(shadow) => props.onChange({ shadow })}
        value={props.style.shadow}
      />
      <div className="grid gap-2 border-t border-[var(--sniptale-color-border-soft)] pt-3">
        <div className="text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]">
          {translate('highlighter.editor.blurDefaultsTitle')}
        </div>
        <EditorCompactRangeField
          label={translate('highlighter.editor.blurStrengthLabel')}
          max={25}
          min={1}
          onChange={(amount) =>
            props.onChange({ effects: { ...effects, blur: { ...effects.blur, amount } } })
          }
          value={effects.blur.amount}
        />
        <PropertyField label={translate('highlighter.editor.blurTypeLabel')}>
          <CompactSelect
            appearance="plain"
            aria-label={translate('highlighter.editor.blurTypeLabel')}
            onChange={(blurType) =>
              props.onChange({ effects: { ...effects, blur: { ...effects.blur, blurType } } })
            }
            options={AVAILABLE_HIGHLIGHTER_BLUR_TYPES.map((value) => ({
              label: blurTypeLabels[value],
              value,
            }))}
            value={effects.blur.blurType}
          />
        </PropertyField>
      </div>
      <div className="grid gap-2 border-t border-[var(--sniptale-color-border-soft)] pt-3">
        <div className="text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]">
          {translate('highlighter.editor.focusDefaultsTitle')}
        </div>
        <EditorCompactRangeField
          displaySuffix="%"
          label={translate('highlighter.editor.focusDimmingLabel')}
          max={100}
          min={10}
          onChange={(opacity) =>
            props.onChange({ effects: { ...effects, focus: { opacity: opacity / 100 } } })
          }
          value={Math.round(effects.focus.opacity * 100)}
        />
      </div>
    </div>
  );
}

function BorderCssSection(props: BorderStyleInspectorProps) {
  return (
    <div className="grid gap-2">
      <div className="relative">
        <textarea
          aria-invalid={props.cssError ? 'true' : undefined}
          className={
            props.onCssResizeStart
              ? editorTextareaClassName
              : editorNativeResizableTextareaClassName
          }
          onChange={(event) => props.onCssDraftChange(event.currentTarget.value)}
          placeholder={translate('highlighter.editor.customCssPlaceholder')}
          rows={props.cssTextareaHeight === undefined ? 5 : undefined}
          style={
            props.cssTextareaHeight === undefined
              ? undefined
              : { height: `${props.cssTextareaHeight}px` }
          }
          value={props.cssDraft}
        />
        {props.onCssResizeStart ? (
          <div
            className={editorResizeHandleClassName}
            onMouseDown={props.onCssResizeStart}
            style={{ cursor: 'ns-resize' }}
          />
        ) : null}
      </div>
      <div className="text-[10px] text-[var(--sniptale-color-text-dim)]">
        {translate('highlighter.editor.customCssHint')}
      </div>
      {props.cssError ? (
        <div className="text-[10px] text-[var(--sniptale-color-danger)]" role="alert">
          {props.cssError}
        </div>
      ) : null}
    </div>
  );
}

function renderBorderSection(section: BorderInspectorSection, props: BorderStyleInspectorProps) {
  if (section === 'outline') return <BorderOutlineSection {...props} />;
  if (section === 'fill') return <BorderFillSection {...props} />;
  if (section === 'geometry') return <BorderGeometrySection {...props} />;
  if (section === 'effects') return <BorderEffectsSection {...props} />;
  if (section === 'css') return <BorderCssSection {...props} />;
  return props.saveSection ?? null;
}

export function BorderStyleInspector(props: BorderStyleInspectorProps) {
  const sections = [
    { icon: Square, id: 'outline', label: translate('highlighter.editor.outlineSection') },
    { icon: PaintBucket, id: 'fill', label: translate('highlighter.editor.fillSection') },
    { icon: Box, id: 'geometry', label: translate('highlighter.editor.geometrySection') },
    { icon: Sparkles, id: 'effects', label: translate('highlighter.editor.effectsSection') },
    { icon: Braces, id: 'css', label: translate('highlighter.editor.customCssLabel') },
    ...(props.saveSection
      ? [{ icon: Save, id: 'save', label: translate('highlighter.editor.saveSection') } as const]
      : []),
  ] satisfies Array<{ icon: typeof Square; id: BorderInspectorSection; label: string }>;
  return (
    <CategorizedInspector
      ariaLabel={translate('highlighter.editor.manualNavigation')}
      dataUi="shared.border-style-inspector"
      initialSection="outline"
      renderSection={(section) => renderBorderSection(section, props)}
      sections={sections}
      showSectionHeading
    />
  );
}
