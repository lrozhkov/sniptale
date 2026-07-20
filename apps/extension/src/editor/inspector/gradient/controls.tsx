import { ArrowLeftRight, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { translate } from '../../../platform/i18n';
import type { EditorGradientColorStop } from '../../../features/editor/document/gradient';
import { resolveEditorGradientStopOpacity } from '../../../features/editor/document/gradient';
import { ColorField, NumericRow, cx } from '../../chrome/ui';
import {
  addGradientEditorStop,
  normalizeGradientEditorStops,
  removeGradientEditorStop,
  reverseGradientEditorStops,
  updateGradientEditorStop,
} from './model';
import { GradientTrack, resolveUpdatedGradientStopIndex } from './track';
export interface EditorGradientControlsProps {
  angle: number;
  className?: string;
  onAngleChange: (angle: number) => void;
  onAngleCommit?: () => void;
  onPreviewStopsChange?: (stops: EditorGradientColorStop[]) => void;
  onStopsChange: (stops: EditorGradientColorStop[]) => void;
  palette?: readonly string[];
  recentColors?: readonly string[];
  resolveStopOpacity?: (args: { selectedIndex: number; stop: EditorGradientColorStop }) => number;
  onStopOpacityChange?: (args: {
    opacity: number;
    selectedIndex: number;
    stop: EditorGradientColorStop;
  }) => void;
  showAngle?: boolean;
  stops: readonly EditorGradientColorStop[];
}

export function EditorGradientControls(props: EditorGradientControlsProps) {
  const model = useGradientControlModel(props);
  return (
    <div className={cx('space-y-3', props.className)}>
      <GradientTrack
        selectedIndex={model.safeSelectedIndex}
        stops={model.stops}
        onOffsetChange={model.updateStopOffset}
        onSelect={model.setSelectedIndex}
      />
      <GradientStopToolbar
        selectedIndex={model.safeSelectedIndex}
        selectedPercent={model.selectedPercent}
        stops={model.stops}
        onAddStop={model.addStop}
        onPatchStops={model.patchStops}
      />
      <GradientStopFields
        model={model}
        {...(props.palette === undefined ? {} : { palette: props.palette })}
        {...(props.recentColors === undefined ? {} : { recentColors: props.recentColors })}
      />
      <GradientAngleField
        angle={props.angle}
        onAngleChange={props.onAngleChange}
        {...(props.showAngle === undefined ? {} : { showAngle: props.showAngle })}
        {...(props.onAngleCommit === undefined ? {} : { onAngleCommit: props.onAngleCommit })}
      />
    </div>
  );
}

function useGradientControlModel(props: EditorGradientControlsProps) {
  const stops = useMemo(() => normalizeGradientEditorStops(props.stops), [props.stops]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const safeSelectedIndex = Math.min(selectedIndex, stops.length - 1);
  const selectedStop = stops[safeSelectedIndex] ?? stops[0];
  const selectedPercent = Math.round((selectedStop?.offset ?? 0) * 100);
  const selectedOpacity = selectedStop
    ? resolveSelectedStopOpacity(props, selectedStop, safeSelectedIndex)
    : 1;
  const selectedOpacityPercent = Math.round(selectedOpacity * 100);
  const mutations = useGradientStopMutations({
    props,
    safeSelectedIndex,
    selectedStop,
    setSelectedIndex,
    stops,
  });

  return {
    ...mutations,
    safeSelectedIndex,
    selectedOpacityPercent,
    selectedPercent,
    selectedStop,
    setSelectedIndex,
    stops,
  };
}

type GradientStopMutationArgs = {
  props: EditorGradientControlsProps;
  safeSelectedIndex: number;
  selectedStop: EditorGradientColorStop | undefined;
  setSelectedIndex: (index: number) => void;
  stops: EditorGradientColorStop[];
};

function useGradientStopMutations(args: GradientStopMutationArgs) {
  const { props, safeSelectedIndex, selectedStop, setSelectedIndex, stops } = args;
  const patchStops = (nextStops: EditorGradientColorStop[]) => {
    props.onStopsChange(nextStops);
    setSelectedIndex(Math.min(safeSelectedIndex, nextStops.length - 1));
  };
  const updateSelectedStop = (
    patch: Partial<EditorGradientColorStop>,
    apply: typeof patchStops
  ) => {
    applyGradientStopUpdate({
      apply,
      patch,
      setSelectedIndex,
      stopIndex: safeSelectedIndex,
      stops,
    });
  };
  return {
    addStop: () => {
      const nextStops = addGradientEditorStop(stops, safeSelectedIndex);
      props.onStopsChange(nextStops);
      setSelectedIndex(Math.min(safeSelectedIndex + 1, nextStops.length - 1));
    },
    patchStops,
    previewStops: (nextStops: EditorGradientColorStop[]) => props.onPreviewStopsChange?.(nextStops),
    updateSelectedStop,
    updateStopOffset: (stopIndex: number, offset: number) =>
      applyGradientStopUpdate({
        apply: props.onStopsChange,
        patch: { offset },
        setSelectedIndex,
        stopIndex,
        stops,
      }),
    updateStopOpacity: (opacity: number) => {
      if (!selectedStop) return;
      if (props.onStopOpacityChange) {
        props.onStopOpacityChange({
          opacity,
          selectedIndex: safeSelectedIndex,
          stop: selectedStop,
        });
      } else {
        updateSelectedStop({ opacity }, props.onStopsChange);
      }
    },
  };
}

function applyGradientStopUpdate(args: {
  apply: (stops: EditorGradientColorStop[]) => void;
  patch: Partial<EditorGradientColorStop>;
  setSelectedIndex: (index: number) => void;
  stopIndex: number;
  stops: EditorGradientColorStop[];
}) {
  const nextStops = updateGradientEditorStop(args.stops, args.stopIndex, args.patch);
  args.apply(nextStops);
  args.setSelectedIndex(
    resolveUpdatedGradientStopIndex(nextStops, {
      ...(args.stops[args.stopIndex] ?? { color: '#ffffff', offset: 0 }),
      ...args.patch,
    })
  );
}

function GradientStopToolbar(props: {
  selectedIndex: number;
  selectedPercent: number;
  stops: EditorGradientColorStop[];
  onAddStop: () => void;
  onPatchStops: (stops: EditorGradientColorStop[]) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-[color:var(--sniptale-color-text-secondary)]">
        {translate('editor.gradient.stop')} {props.selectedIndex + 1} · {props.selectedPercent}%
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={GRADIENT_ICON_BUTTON_CLASS_NAME}
          aria-label={translate('editor.gradient.addStop')}
          onClick={props.onAddStop}
        >
          <Plus size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={GRADIENT_ICON_BUTTON_CLASS_NAME}
          aria-label={translate('editor.gradient.reverseStops')}
          onClick={() => props.onPatchStops(reverseGradientEditorStops(props.stops))}
        >
          <ArrowLeftRight size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={cx(
            GRADIENT_ICON_BUTTON_CLASS_NAME,
            'text-[color:var(--sniptale-color-danger)]'
          )}
          disabled={props.stops.length <= 2}
          aria-label={translate('editor.gradient.removeStop')}
          onClick={() =>
            props.onPatchStops(removeGradientEditorStop(props.stops, props.selectedIndex))
          }
        >
          <Trash2 size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

function GradientStopFields(props: {
  model: ReturnType<typeof useGradientControlModel>;
  palette?: readonly string[];
  recentColors?: readonly string[];
}) {
  const { model } = props;
  return (
    <>
      <ColorField
        title={translate('editor.gradient.color')}
        label={translate('editor.gradient.color')}
        value={model.selectedStop?.color ?? '#ffffff'}
        {...(props.palette === undefined ? {} : { palette: props.palette })}
        {...(props.recentColors === undefined ? {} : { recentColors: props.recentColors })}
        onChange={(color) => model.updateSelectedStop({ color }, model.patchStops)}
        onPreviewChange={(color) => model.updateSelectedStop({ color }, model.previewStops)}
        onPreviewReset={(color) => model.updateSelectedStop({ color }, model.previewStops)}
      />
      <NumericRow
        label={translate('editor.gradient.opacity')}
        min={0}
        max={100}
        step={1}
        precision={0}
        unit="%"
        value={model.selectedOpacityPercent}
        onPreviewValue={(opacity) => model.updateStopOpacity(opacity / 100)}
        onCommitValue={(opacity) => model.updateStopOpacity(opacity / 100)}
        scrub={{ min: 0, max: 100, step: 1 }}
      />
    </>
  );
}

function GradientAngleField(props: {
  angle: number;
  showAngle?: boolean;
  onAngleChange: (angle: number) => void;
  onAngleCommit?: () => void;
}) {
  if (props.showAngle === false) {
    return null;
  }
  return (
    <NumericRow
      label={translate('editor.gradient.angle')}
      min={0}
      max={360}
      step={5}
      precision={0}
      unit="deg"
      value={props.angle}
      onPreviewValue={props.onAngleChange}
      onCommitValue={(angle) => {
        props.onAngleChange(angle);
        props.onAngleCommit?.();
      }}
      scrub={{ min: 0, max: 360, step: 5 }}
    />
  );
}

function resolveSelectedStopOpacity(
  props: EditorGradientControlsProps,
  stop: EditorGradientColorStop,
  selectedIndex: number
): number {
  return Math.min(
    1,
    Math.max(
      0,
      props.resolveStopOpacity?.({ selectedIndex, stop }) ?? resolveEditorGradientStopOpacity(stop)
    )
  );
}

const GRADIENT_ICON_BUTTON_CLASS_NAME = [
  'inline-flex h-7 w-7 items-center justify-center rounded-[6px]',
  'text-[color:var(--sniptale-color-text-muted-strong)] transition',
  'hover:bg-[color:var(--sniptale-color-surface-muted)]',
  'disabled:cursor-not-allowed disabled:opacity-40',
].join(' ');
