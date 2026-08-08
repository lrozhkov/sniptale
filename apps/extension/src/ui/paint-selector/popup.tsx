import { createPortal } from 'react-dom';
import type { RefObject } from 'react';
import {
  createSolidPaint,
  instantiatePaint,
  updateGradientStop,
  type GradientType,
  type Paint,
  type PaintStopIdFactory,
} from '@sniptale/foundation/paint';
import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';
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
import { GradientEditor } from './gradient-editor';
import { resolvePaintSelectorLayerStyle } from './lifecycle';
import {
  GradientPresetControls,
  type GradientPresetActions,
  type GradientPresetOption,
} from './preset-controls';

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
  presetActions?: Omit<GradientPresetActions, 'onApply'>;
  presets?: readonly GradientPresetOption[];
  preview: (paint: Paint) => void;
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
    props.rootRef.current
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
  const presetActions = props.presetActions
    ? {
        ...props.presetActions,
        onApply: (preset: GradientPresetOption) => {
          const paint = instantiatePaint(
            { kind: 'gradient', gradient: preset.gradient },
            props.createId
          );
          props.preview(paint);
          props.selectStop(
            paint.kind === 'gradient' ? (paint.gradient.stops[0]?.id ?? null) : null
          );
        },
      }
    : undefined;

  return (
    <div
      role="dialog"
      aria-label={props.title}
      className={POPUP_CLASS_NAME}
      data-ui="shared.ui.paint-selector.popup"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <strong className="text-sm">{props.title}</strong>
        <select
          className="h-8 rounded-[7px] border border-[var(--sniptale-color-border-soft)] bg-transparent px-2 text-xs"
          aria-label={translate('highlighter.paintPicker.mode')}
          value={mode}
          onChange={(event) => props.onModeChange(event.target.value as 'solid' | GradientType)}
        >
          <option value="solid">{translate('highlighter.paintPicker.solid')}</option>
          <option value="linear">{translate('highlighter.paintPicker.linear')}</option>
          <option value="radial">{translate('highlighter.paintPicker.radial')}</option>
          <option value="conic">{translate('highlighter.paintPicker.conic')}</option>
        </select>
      </div>
      <div
        className={
          props.draft.kind === 'gradient'
            ? 'grid gap-4 min-[560px]:grid-cols-[minmax(0,1fr)_280px]'
            : 'mx-auto max-w-[280px]'
        }
      >
        {props.draft.kind === 'gradient' ? (
          <div>
            <GradientEditor
              createId={props.createId}
              gradient={props.draft.gradient}
              selectedStopId={props.selectedStopId}
              onSelectStop={props.selectStop}
              onChange={(gradient) => props.preview({ kind: 'gradient', gradient })}
            />
            <GradientPresetControls
              {...(presetActions ? { actions: presetActions } : {})}
              gradient={props.draft.gradient}
              {...(props.presets ? { presets: props.presets } : {})}
            />
          </div>
        ) : null}
        <ColorEditorPanel
          key={selected?.id ?? 'solid'}
          allowAlpha
          color={
            selected?.color ?? (props.draft.kind === 'solid' ? props.draft.color : '#000000ff')
          }
          formatMode={props.formatMode}
          onCycleFormatMode={props.onCycleFormatMode}
          onEyedropperStateChange={props.onEyedropperStateChange}
          onSelectTransparent={() => changeColor('#00000000')}
          onColorChange={changeColor}
        />
      </div>
      <div className="mt-3">
        <PickerFooter onApply={props.apply} onCancel={props.cancel} />
      </div>
    </div>
  );
}
