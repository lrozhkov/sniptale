import { createPortal } from 'react-dom';
import type { RefObject } from 'react';
import {
  createSolidPaint,
  updateGradientStop,
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

const POPUP_CLASS_NAME = [
  'rounded-[14px] border border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-panel)] p-3',
  'text-[var(--sniptale-color-text-primary)] shadow-2xl',
].join(' ');

type PaintSelectorPopupProps = {
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
  selectedStopId: string | null;
  selectStop: (id: string | null) => void;
  title: string;
};

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
  const theme = useResolvedPortalTheme(props.rootRef.current);
  const layerStyle = resolvePaintSelectorLayerStyle(
    useColorSelectorLayerStyle(props.rootRef.current, props.open),
    props.rootRef.current,
    props.draft.kind
  );
  if (!props.open || !portalTarget) return null;
  const { layerRef, open: _open, ownerId, rootRef: _rootRef, ...popupProps } = props;
  return createPortal(
    <ColorSelectorFloatingLayer
      layerRef={layerRef}
      ownerId={ownerId}
      portalTheme={theme}
      ui="shared.ui.paint-selector.layer"
      style={layerStyle}
    >
      <PaintSelectorPopup {...popupProps} />
    </ColorSelectorFloatingLayer>,
    portalTarget
  );
}

function PaintSelectorPopup(props: PaintSelectorPopupProps) {
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
      className={POPUP_CLASS_NAME}
      data-ui="shared.ui.paint-selector.popup"
    >
      <div className="mb-3 grid gap-2.5">
        <strong className="text-sm">{props.title}</strong>
        <PaintModeSelector mode={mode} onChange={props.onModeChange} />
      </div>
      <div
        className={
          props.draft.kind === 'gradient'
            ? 'grid gap-4 min-[560px]:grid-cols-[minmax(0,1fr)_280px]'
            : 'mx-auto max-w-[280px]'
        }
      >
        {props.draft.kind === 'gradient' ? (
          <div className="min-w-0">
            <GradientEditor
              createId={props.createId}
              gradient={props.draft.gradient}
              selectedStopId={props.selectedStopId}
              onSelectStop={props.selectStop}
              onChange={(gradient) => props.preview({ kind: 'gradient', gradient })}
            />
          </div>
        ) : null}
        <div className="min-w-0 space-y-3">
          {props.draft.kind === 'solid' && palette.length > 0 ? (
            <ColorSelectorSwatchSection
              colors={palette}
              gridClassName="grid grid-cols-10 justify-items-center gap-1.5"
              label={translate('shared.ui.colorSelectorPalette')}
              onSelect={changeColor}
              selectedColor={props.draft.color}
              title={props.title}
            />
          ) : null}
          <ColorEditorPanel
            key={selected?.id ?? 'solid'}
            allowAlpha
            color={
              selected?.color ?? (props.draft.kind === 'solid' ? props.draft.color : '#000000ff')
            }
            formatMode={props.formatMode}
            eyedropper={eyedropper}
            onCycleFormatMode={props.onCycleFormatMode}
            onSelectTransparent={() => changeColor('#00000000')}
            onColorChange={changeColor}
          />
        </div>
      </div>
      <div className="mt-3">
        <PickerFooter onApply={props.apply} onCancel={props.cancel} />
      </div>
    </div>
  );
}
