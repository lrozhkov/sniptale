import { createPortal } from 'react-dom';
import { useState, type RefObject } from 'react';
import {
  createSolidPaint,
  updateGradientStop,
  type GradientStop,
  type GradientType,
  type Paint,
  type PaintStopIdFactory,
} from '@sniptale/foundation/paint';
import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';
import { useEyedropper } from '@sniptale/ui/color-selector/popover-state';
import {
  ColorSelectorFloatingLayer,
  useColorSelectorLayerStyle,
} from '@sniptale/ui/color-selector/floating-layer';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { translate } from '../../platform/i18n';
import { ColorEditorPanel } from '../color-selector/editor-panel';
import { PickerFooter } from '../color-selector/picker-sections';
import { ColorSelectorSwatchSection } from '../color-selector/swatch-section';
import { GradientEditor } from './gradient-editor';
import { resolvePaintSelectorLayerStyle } from './lifecycle';
import { PaintModeSelector } from './mode-selector';
import { GradientTemplatePanel } from './template-panel';

const POPUP_CLASS_NAME = [
  'overflow-hidden rounded-[16px] border',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_58%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_98%,transparent)] p-3',
  'text-[var(--sniptale-color-text-primary)]',
  'shadow-[0_20px_48px_color-mix(in_srgb,var(--sniptale-color-shadow-strong)_18%,transparent)]',
].join(' ');
const POPUP_HEADER_CLASS_NAME = [
  'mb-3 flex min-w-0 items-center gap-3 border-b pb-3',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_54%,transparent)]',
].join(' ');
const EDITOR_SECTION_CLASS_NAME = [
  'min-w-0 rounded-[12px] border p-3',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_58%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-muted)_54%,transparent)]',
].join(' ');
const COLOR_SECTION_CLASS_NAME = [
  'min-w-0 space-y-3 rounded-[12px] border p-3',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_58%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-muted)_38%,transparent)]',
].join(' ');

type PaintSelectorPopupProps = {
  allowedModes?: readonly ('solid' | GradientType)[];
  apply: () => void;
  cancel: () => void;
  createId: PaintStopIdFactory;
  draft: Paint;
  formatMode: ColorSelectorFormatMode;
  onCycleFormatMode: () => void;
  onEyedropperStateChange: (active: boolean) => void;
  onModeChange: (mode: 'solid' | GradientType) => void;
  palette: readonly string[];
  preview: (paint: Paint) => void;
  recentColors: readonly string[];
  showGradientAdvancedControls?: boolean;
  selectedStopId: string | null;
  selectStop: (id: string | null) => void;
  title: string;
};
type PaintSelectorSection = 'paint' | 'templates';

export function PaintSelectorPortal(
  props: PaintSelectorPopupProps & {
    layerRef: RefObject<HTMLDivElement | null>;
    open: boolean;
    ownerId: string;
    rootRef: RefObject<HTMLDivElement | null>;
  }
) {
  const portalTarget =
    typeof document === 'undefined' ? null : resolveThemeSafePortalTarget(props.rootRef.current);
  if (!props.open || !portalTarget) return null;
  return createPortal(<PaintSelectorLayer {...props} />, portalTarget);
}

function PaintSelectorLayer(
  props: PaintSelectorPopupProps & {
    layerRef: RefObject<HTMLDivElement | null>;
    open: boolean;
    ownerId: string;
    rootRef: RefObject<HTMLDivElement | null>;
  }
) {
  const [section, setSection] = useState<PaintSelectorSection>('paint');
  const theme = useResolvedPortalTheme(props.rootRef.current);
  const layerStyle = resolvePaintSelectorLayerStyle(
    useColorSelectorLayerStyle(props.rootRef.current, props.open),
    props.rootRef.current,
    section === 'templates' ? 'solid' : props.draft.kind
  );
  const { layerRef, open: _open, ownerId, rootRef: _rootRef, ...popupProps } = props;
  return (
    <ColorSelectorFloatingLayer
      layerRef={layerRef}
      ownerId={ownerId}
      portalTheme={theme}
      ui="shared.ui.paint-selector.layer"
      style={layerStyle}
    >
      <PaintSelectorPopup section={section} setSection={setSection} {...popupProps} />
    </ColorSelectorFloatingLayer>
  );
}

function getPaintSelectorHeading(
  section: PaintSelectorSection,
  mode: 'solid' | GradientType
): string {
  if (section === 'templates') return translate('highlighter.paintPicker.presets');
  if (mode === 'solid') return translate('highlighter.paintPicker.solid');
  if (mode === 'linear') return translate('highlighter.paintPicker.linear');
  if (mode === 'radial') return translate('highlighter.paintPicker.radial');
  return translate('highlighter.paintPicker.conic');
}

function PaintSelectorPopupHeader(props: {
  activeSection: PaintSelectorSection;
  allowedModes?: readonly ('solid' | GradientType)[];
  mode: 'solid' | GradientType;
  onModeChange: (mode: 'solid' | GradientType) => void;
  onShowTemplates: () => void;
}) {
  return (
    <div className={POPUP_HEADER_CLASS_NAME}>
      <strong className="min-w-0 flex-1 truncate text-left text-sm">
        {getPaintSelectorHeading(props.activeSection, props.mode)}
      </strong>
      <PaintModeSelector
        {...(props.allowedModes === undefined ? {} : { allowedModes: props.allowedModes })}
        activeSection={props.activeSection}
        mode={props.mode}
        onChange={props.onModeChange}
        onShowTemplates={props.onShowTemplates}
      />
    </div>
  );
}

function PaintSelectorEditorContent(props: {
  changeColor: (color: string) => void;
  eyedropper: ReturnType<typeof useEyedropper>;
  palette: readonly string[];
  popup: PaintSelectorPopupProps;
  selected: GradientStop | null;
}) {
  const { popup } = props;
  return (
    <div
      className={
        popup.draft.kind === 'gradient'
          ? 'grid gap-4 min-[560px]:grid-cols-[minmax(0,1fr)_280px]'
          : 'mx-auto max-w-[280px]'
      }
    >
      {popup.draft.kind === 'gradient' ? (
        <div className={EDITOR_SECTION_CLASS_NAME}>
          <GradientEditor
            createId={popup.createId}
            gradient={popup.draft.gradient}
            showAdvancedControls={popup.showGradientAdvancedControls !== false}
            selectedStopId={popup.selectedStopId}
            onSelectStop={popup.selectStop}
            onChange={(gradient) => popup.preview({ kind: 'gradient', gradient })}
          />
        </div>
      ) : null}
      <div className={COLOR_SECTION_CLASS_NAME}>
        {popup.draft.kind === 'solid' && props.palette.length > 0 ? (
          <ColorSelectorSwatchSection
            colors={props.palette}
            gridClassName="grid grid-cols-10 justify-items-center gap-1.5"
            label={translate('shared.ui.colorSelectorPalette')}
            onSelect={props.changeColor}
            selectedColor={popup.draft.color}
            title={popup.title}
          />
        ) : null}
        <ColorEditorPanel
          key={props.selected?.id ?? 'solid'}
          allowAlpha
          color={
            props.selected?.color ??
            (popup.draft.kind === 'solid' ? popup.draft.color : '#000000ff')
          }
          formatMode={popup.formatMode}
          eyedropper={props.eyedropper}
          onCycleFormatMode={popup.onCycleFormatMode}
          onSelectTransparent={() => props.changeColor('#00000000')}
          onColorChange={props.changeColor}
        />
      </div>
    </div>
  );
}

function PaintSelectorPopup(
  props: PaintSelectorPopupProps & {
    section: PaintSelectorSection;
    setSection: (section: PaintSelectorSection) => void;
  }
) {
  const selected =
    props.draft.kind === 'gradient'
      ? (props.draft.gradient.stops.find((stop) => stop.id === props.selectedStopId) ??
        props.draft.gradient.stops[0])
      : null;
  const mode = props.draft.kind === 'solid' ? 'solid' : props.draft.gradient.type;
  const changeColor = (color: string) => {
    if (props.draft.kind === 'solid') props.preview(createSolidPaint(color));
    else if (selected)
      props.preview({
        kind: 'gradient',
        gradient: updateGradientStop(props.draft.gradient, selected.id, { color }),
      });
  };
  const eyedropper = useEyedropper(changeColor, props.onEyedropperStateChange);
  const palette = Array.from(new Set([...props.recentColors, ...props.palette])).slice(0, 10);

  return (
    <div
      role="dialog"
      aria-label={props.title}
      className={`${POPUP_CLASS_NAME} outline-none`}
      data-ui="shared.ui.paint-selector.popup"
      tabIndex={-1}
    >
      <PaintSelectorPopupHeader
        {...(props.allowedModes === undefined ? {} : { allowedModes: props.allowedModes })}
        activeSection={props.section}
        mode={mode}
        onModeChange={(nextMode) => {
          props.setSection('paint');
          props.onModeChange(nextMode);
        }}
        onShowTemplates={() => props.setSection('templates')}
      />
      {props.section === 'templates' ? (
        <div className={EDITOR_SECTION_CLASS_NAME}>
          <GradientTemplatePanel
            {...(props.allowedModes === undefined ? {} : { allowedModes: props.allowedModes })}
            {...(props.draft.kind === 'gradient' ? { activeGradient: props.draft.gradient } : {})}
            onSelect={(gradient) => {
              props.preview({ kind: 'gradient', gradient });
              props.selectStop(gradient.stops[0]?.id ?? null);
            }}
            onCopy={(gradient) => {
              props.preview({ kind: 'gradient', gradient });
              props.selectStop(gradient.stops[0]?.id ?? null);
              props.setSection('paint');
            }}
          />
        </div>
      ) : (
        <PaintSelectorEditorContent
          changeColor={changeColor}
          eyedropper={eyedropper}
          palette={palette}
          popup={props}
          selected={selected ?? null}
        />
      )}
      <div className="mt-3">
        <PickerFooter onApply={props.apply} onCancel={props.cancel} />
      </div>
    </div>
  );
}
