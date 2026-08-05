import type {
  BorderPadding,
  BorderVisualStyle,
  BorderVisualStylePatch,
} from '../../../features/highlighter/contracts';
import { Braces, Box, Circle, Droplets, Save, Square } from 'lucide-react';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { ProductGlassChip, ProductGlassRow } from '@sniptale/ui/product-glass-controls';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { translate } from '../../../platform/i18n';
import { CompactColorSelector } from '../../color-selector';
import { CategorizedInspector } from '@sniptale/ui/categorized-inspector';
import { EditorCompactRangeField } from './sections/compact-range-field';
import { editorResizeHandleClassName, editorTextareaClassName } from '../constants';

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

function InspectorHeading({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]">
      {children}
    </div>
  );
}

function BorderColorField(props: {
  label: string;
  onChange: (color: string) => void;
  value: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]">
        {props.label}
      </label>
      <CompactColorSelector
        label={props.label}
        onChange={props.onChange}
        palette={BORDER_PALETTE}
        recentColors={[props.value]}
        title={props.label}
        value={props.value}
      />
    </div>
  );
}

function BorderOutlineSection(props: BorderStyleInspectorProps) {
  return (
    <div className="grid gap-3">
      <InspectorHeading>{translate('highlighter.editor.outlineSection')}</InspectorHeading>
      <BorderColorField
        label={translate('highlighter.editor.borderColorLabel')}
        onChange={(color) => props.onChange({ color })}
        value={props.style.color}
      />
      <ProductGlassRow>
        {(['solid', 'dashed', 'dotted'] as const).map((style) => (
          <ProductGlassChip
            active={props.style.style === style}
            key={style}
            onClick={() => props.onChange({ style })}
          >
            {translate(
              style === 'solid'
                ? 'highlighter.editor.styleSolid'
                : style === 'dashed'
                  ? 'highlighter.editor.styleDashed'
                  : 'highlighter.editor.styleDotted'
            )}
          </ProductGlassChip>
        ))}
      </ProductGlassRow>
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
      <InspectorHeading>{translate('highlighter.editor.fillSection')}</InspectorHeading>
      <BorderColorField
        label={translate('highlighter.editor.fillColorLabel')}
        onChange={(fillColor) => props.onChange({ fillColor })}
        value={props.style.fillColor}
      />
      <ProductGlassChip
        active={props.style.fillOpacity === 0}
        onClick={() => props.onChange({ fillOpacity: 0 })}
      >
        {translate('highlighter.editor.noFill')}
      </ProductGlassChip>
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

function arePaddingValuesEqual(padding: BorderPadding) {
  return [padding.right, padding.bottom, padding.left].every((value) => value === padding.top);
}

function BorderPaddingFields(props: BorderStyleInspectorProps) {
  const [linked, setLinked] = useState(() => arePaddingValuesEqual(props.style.padding));
  useEffect(() => {
    if (arePaddingValuesEqual(props.style.padding)) setLinked(true);
  }, [props.style.padding]);
  const setUniformPadding = (value: number) =>
    props.onChange({ padding: { top: value, right: value, bottom: value, left: value } });
  const labels = {
    top: translate('highlighter.editor.paddingTop'),
    right: translate('highlighter.editor.paddingRight'),
    bottom: translate('highlighter.editor.paddingBottom'),
    left: translate('highlighter.editor.paddingLeft'),
  };
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]">
          {translate('highlighter.editor.paddingLabel')}
        </span>
        <ProductGlassRow>
          <ProductGlassChip active={linked} onClick={() => setLinked(true)}>
            {translate('highlighter.editor.paddingLinked')}
          </ProductGlassChip>
          <ProductGlassChip active={!linked} onClick={() => setLinked(false)}>
            {translate('highlighter.editor.paddingSeparate')}
          </ProductGlassChip>
        </ProductGlassRow>
      </div>
      {linked ? (
        <ProductInput
          aria-label={translate('highlighter.editor.paddingLabel')}
          max={50}
          min={0}
          onChange={(event) => setUniformPadding(Number(event.currentTarget.value))}
          type="number"
          value={props.style.padding.top}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(labels) as Array<keyof BorderPadding>).map((side) => (
            <label
              className="grid gap-1 text-[10px] text-[var(--sniptale-color-text-dim)]"
              key={side}
            >
              {labels[side]}
              <ProductInput
                max={50}
                min={0}
                onChange={(event) =>
                  props.onChange({
                    padding: {
                      ...props.style.padding,
                      [side]: Number(event.currentTarget.value),
                    },
                  })
                }
                type="number"
                value={props.style.padding[side]}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function BorderGeometrySection(props: BorderStyleInspectorProps) {
  return (
    <div className="grid gap-3">
      <InspectorHeading>{translate('highlighter.editor.geometrySection')}</InspectorHeading>
      <EditorCompactRangeField
        displaySuffix="px"
        label={translate('highlighter.editor.radiusLabel')}
        max={50}
        min={0}
        onChange={(radius) => props.onChange({ radius })}
        value={props.style.radius}
      />
      <BorderPaddingFields {...props} />
    </div>
  );
}

function BorderEffectsSection(props: BorderStyleInspectorProps) {
  return (
    <div className="grid gap-3">
      <InspectorHeading>{translate('highlighter.editor.effectsSection')}</InspectorHeading>
      <EditorCompactRangeField
        displaySuffix="%"
        label={translate('highlighter.editor.shadowLabel')}
        max={100}
        min={0}
        onChange={(shadow) => props.onChange({ shadow })}
        value={props.style.shadow}
      />
    </div>
  );
}

function BorderCssSection(props: BorderStyleInspectorProps) {
  return (
    <div className="grid gap-2">
      <InspectorHeading>{translate('highlighter.editor.customCssLabel')}</InspectorHeading>
      <div className="relative">
        <textarea
          aria-invalid={props.cssError ? 'true' : undefined}
          className={editorTextareaClassName}
          onChange={(event) => props.onCssDraftChange(event.currentTarget.value)}
          placeholder={translate('highlighter.editor.customCssPlaceholder')}
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
    { icon: Droplets, id: 'fill', label: translate('highlighter.editor.fillSection') },
    { icon: Box, id: 'geometry', label: translate('highlighter.editor.geometrySection') },
    { icon: Circle, id: 'effects', label: translate('highlighter.editor.effectsSection') },
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
    />
  );
}
