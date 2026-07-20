import { ArrowLeftRight, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { translate } from '../../../../../platform/i18n';
import {
  addVideoSceneGradientStop,
  createVideoSceneGradientCssStops,
  normalizeVideoSceneGradientStops,
  removeVideoSceneGradientStop,
  resolveVideoSceneGradientEndpointColors,
  reverseVideoSceneGradientStops,
  updateVideoSceneGradientStop,
} from '../../../../../features/video/project/scene/gradient-stops';
import { ColorField as CompactInspectorColorField } from '../../../../../ui/compact-inspector-controls';
import type { VideoSceneGradientColorStop } from '../../../../../features/video/project/types';
import { SliderField } from '../shared/sliders';
import {
  SCENE_BACKGROUND_PALETTE,
  type GradientSceneBackground,
  type SceneBackgroundFieldProps,
} from './shared';

type GradientStopControlProps = Omit<SceneBackgroundFieldProps, 'sceneBackground'> & {
  background: GradientSceneBackground;
};

type SelectedGradientStopProps = GradientStopControlProps & {
  selectedIndex: number;
  selectedStop?: VideoSceneGradientColorStop;
  stops: readonly VideoSceneGradientColorStop[];
};

type PatchGradientStops = (stops: VideoSceneGradientColorStop[], selectedIndex: number) => void;

export function GradientStopControls(props: GradientStopControlProps) {
  const stops = getGradientStops(props.background);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const safeSelectedIndex = Math.min(selectedIndex, stops.length - 1);
  const selectedStop = stops[safeSelectedIndex] ?? stops[0];

  if (!selectedStop) {
    return null;
  }

  return (
    <div className="space-y-3">
      <GradientStopTrack
        selectedIndex={safeSelectedIndex}
        stops={stops}
        onSelect={setSelectedIndex}
      />
      <GradientStopToolbar
        selectedIndex={safeSelectedIndex}
        stops={stops}
        onPatchStops={(nextStops, nextIndex) =>
          commitStops(props, nextStops, nextIndex, setSelectedIndex)
        }
      />
      <GradientSelectedStopFields
        selectedIndex={safeSelectedIndex}
        selectedStop={selectedStop}
        stops={stops}
        {...props}
      />
    </div>
  );
}

function GradientSelectedStopFields(props: SelectedGradientStopProps) {
  if (!props.selectedStop) {
    return null;
  }

  return (
    <>
      <CompactInspectorColorField
        title={translate('editor.gradient.color')}
        label={translate('editor.gradient.color')}
        value={props.selectedStop.color}
        recentColors={props.recentColors}
        palette={SCENE_BACKGROUND_PALETTE}
        onChange={(color) => commitSelectedStopColor(props, color)}
        onPreviewChange={(color) => previewSelectedStopColor(props, color)}
        onPreviewReset={props.onResetSceneBackgroundPreview}
      />
      <SliderField
        label={translate('editor.gradient.position')}
        value={Math.round(props.selectedStop.offset * 100)}
        min={0}
        max={100}
        step={1}
        onChange={(offset) => commitSelectedStop(props, { offset: offset / 100 })}
        formatValue={(value) => `${Math.round(value)}%`}
      />
      <SliderField
        label={translate('editor.gradient.opacity')}
        value={Math.round((props.selectedStop.opacity ?? 1) * 100)}
        min={0}
        max={100}
        step={1}
        onChange={(opacity) => commitSelectedStop(props, { opacity: opacity / 100 })}
        formatValue={(value) => `${Math.round(value)}%`}
      />
    </>
  );
}

function GradientStopTrack(props: {
  selectedIndex: number;
  stops: readonly VideoSceneGradientColorStop[];
  onSelect: (index: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div
        className="h-8 rounded-[10px] border border-[color:var(--sniptale-color-border-soft)]"
        style={{
          background: `linear-gradient(90deg, ${createVideoSceneGradientCssStops(props.stops)})`,
        }}
      />
      <div className="flex items-center gap-1">
        {props.stops.map((stop, index) => (
          <GradientStopSwatch
            key={`${stop.color}-${stop.offset}-${index}`}
            index={index}
            selected={props.selectedIndex === index}
            stop={stop}
            onSelect={props.onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function GradientStopSwatch(props: {
  index: number;
  selected: boolean;
  stop: VideoSceneGradientColorStop;
  onSelect: (index: number) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${translate('editor.gradient.stop')} ${props.index + 1}`}
      aria-pressed={props.selected}
      className={[
        'h-6 flex-1 rounded-[6px] border transition',
        props.selected
          ? 'border-[color:var(--sniptale-color-accent)]'
          : 'border-[color:var(--sniptale-color-border-soft)]',
      ].join(' ')}
      style={{ background: props.stop.color }}
      onClick={() => props.onSelect(props.index)}
    />
  );
}

function GradientStopToolbar(props: {
  selectedIndex: number;
  stops: readonly VideoSceneGradientColorStop[];
  onPatchStops: PatchGradientStops;
}) {
  const selectedStop = props.stops[props.selectedIndex] ?? props.stops[0];
  const selectedPercent = Math.round((selectedStop?.offset ?? 0) * 100);
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-[var(--sniptale-color-text-secondary)]">
        {translate('editor.gradient.stop')} {props.selectedIndex + 1} · {selectedPercent}%
      </span>
      <div className="flex items-center gap-1">
        <GradientToolbarButtons {...props} />
      </div>
    </div>
  );
}

function GradientToolbarButtons(props: {
  selectedIndex: number;
  stops: readonly VideoSceneGradientColorStop[];
  onPatchStops: PatchGradientStops;
}) {
  return (
    <>
      <GradientIconButton
        label={translate('editor.gradient.addStop')}
        onClick={() =>
          props.onPatchStops(
            addVideoSceneGradientStop(props.stops, props.selectedIndex),
            props.selectedIndex + 1
          )
        }
      >
        <Plus size={14} strokeWidth={2} />
      </GradientIconButton>
      <GradientIconButton
        label={translate('editor.gradient.reverseStops')}
        onClick={() =>
          props.onPatchStops(reverseVideoSceneGradientStops(props.stops), props.selectedIndex)
        }
      >
        <ArrowLeftRight size={14} strokeWidth={2} />
      </GradientIconButton>
      <GradientIconButton
        disabled={props.stops.length <= 2}
        label={translate('editor.gradient.removeStop')}
        onClick={() =>
          props.onPatchStops(
            removeVideoSceneGradientStop(props.stops, props.selectedIndex),
            props.selectedIndex
          )
        }
      >
        <Trash2 size={14} strokeWidth={2} />
      </GradientIconButton>
    </>
  );
}

function GradientIconButton(props: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      aria-label={props.label}
      title={props.label}
      className={[
        'inline-flex h-7 w-7 items-center justify-center rounded-[7px] border',
        'border-[color:var(--sniptale-color-border-soft)] text-[var(--sniptale-color-text-secondary)]',
        'transition hover:border-[color:var(--sniptale-color-border-strong)]',
        'disabled:cursor-not-allowed disabled:opacity-45',
      ].join(' ')}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function commitStops(
  props: GradientStopControlProps,
  stops: readonly VideoSceneGradientColorStop[],
  selectedIndex: number,
  setSelectedIndex: (index: number) => void
) {
  const nextBackground = createGradientBackground(props.background, stops);
  props.onSetSceneBackground(nextBackground);
  props.onResetSceneBackgroundPreview();
  setSelectedIndex(Math.max(0, Math.min(selectedIndex, (nextBackground.stops?.length ?? 1) - 1)));
}

function commitSelectedStop(
  props: SelectedGradientStopProps,
  patch: Partial<VideoSceneGradientColorStop>
) {
  const nextStops = updateVideoSceneGradientStop(props.stops, props.selectedIndex, patch);
  props.onSetSceneBackground(createGradientBackground(props.background, nextStops));
  props.onResetSceneBackgroundPreview();
}

function commitSelectedStopColor(props: SelectedGradientStopProps, color: string) {
  commitSelectedStop(props, { color });
  void props.onRememberRecentColor(color);
}

function previewSelectedStopColor(props: SelectedGradientStopProps, color: string) {
  const nextStops = updateVideoSceneGradientStop(props.stops, props.selectedIndex, { color });
  props.onPreviewSceneBackground(createGradientBackground(props.background, nextStops));
}

function createGradientBackground(
  background: GradientSceneBackground,
  stops: readonly VideoSceneGradientColorStop[]
): GradientSceneBackground {
  const normalizedStops = normalizeVideoSceneGradientStops(stops, background.from, background.to);
  const endpoints = resolveVideoSceneGradientEndpointColors(
    normalizedStops,
    background.from,
    background.to
  );
  return {
    kind: 'gradient',
    angle: background.angle,
    from: endpoints.from,
    to: endpoints.to,
    stops: normalizedStops,
    ...(background.animation ? { animation: background.animation } : {}),
  };
}

function getGradientStops(background: GradientSceneBackground) {
  return normalizeVideoSceneGradientStops(background.stops, background.from, background.to);
}
