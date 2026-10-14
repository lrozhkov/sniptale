import {
  applyCameraFollowPreset,
  cameraFollowPreset,
  resolveCameraFollowPolicy,
  type CameraFollowSettings,
} from '../../features/video/project/camera/cursor-policy';
import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
import {
  reviewCursorFocusTimelineKeys,
  adjacentCursorFocusKey,
} from '../../features/video/project/cursor-focus-path/timeline';
import { cursorFocusKeyControls } from '../../features/video/project/cursor-focus-path/evaluator';
import { translate, formatNumber } from '../../platform/i18n';
import type { CursorFocusPath } from '../../features/video/project/cursor-focus-path/types';
import {
  addReviewCursorFocusKey,
  deleteCursorFocusKey,
  updateCursorFocusKey,
  cursorFocusOverrideId,
  compareCursorFocusKeys,
} from '../../features/video/project/cursor-focus-path/authoring';
import { evaluateReviewCursorFocus } from '../../features/video/review/advanced/cursor-focus-path';
import { Clock3, MousePointer2, Navigation, SlidersHorizontal } from 'lucide-react';
import { SelectField } from '../../ui/compact-inspector-controls';
import { ReviewNumberRow } from './number-row';
import { ReviewInspectorSections, reviewInspectorActions } from './inspector-sections';
import {
  ReviewButton,
  ReviewDetails,
  reviewSelectFieldClassName,
  reviewTextButtonClassName,
} from './controls';

/** Source-time inspector; each canvas gesture commits only its final authored path. */
interface CursorPathEditorProps {
  path: CursorFocusPath;
  time: number;
  duration?: number;
  onSeek?(time: number): void;
  selectedKeyId?: string;
  onSelect?(id: string, time: number): void;
  disabled: boolean;
  onChange(path: CursorFocusPath | undefined): void;
}

function cursorEditorState(props: CursorPathEditorProps) {
  const keys = reviewCursorFocusTimelineKeys(props.path);
  const select = (id: string, time: number) =>
    props.onSelect ? props.onSelect(id, time) : props.onSeek?.(time);
  const segment =
    props.path.segments.find((item) => item.keys.some((key) => key.id === props.selectedKeyId)) ??
    props.path.segments.find((item) => props.time >= item.start && props.time <= item.end);
  const selected =
    segment?.keys.find((key) => key.id === props.selectedKeyId) ??
    segment?.keys.toSorted(
      (a, b) =>
        Math.abs(a.time - props.time) - Math.abs(b.time - props.time) ||
        compareCursorFocusKeys(b, a)
    )[0];
  const constrained = evaluateReviewCursorFocus(props.path, props.time)?.constrained;
  const controls =
    selected && segment
      ? cursorFocusKeyControls(segment, selected.id, props.path.smoothing)
      : { incoming: undefined, outgoing: undefined };
  const editable = selected !== undefined;
  const change = (patch: Parameters<typeof updateCursorFocusKey>[2]) => {
    if (!selected) return;
    const next = updateCursorFocusKey(props.path, selected.id, patch);
    props.onChange(next);
    if (patch.time !== undefined || patch.x !== undefined || patch.y !== undefined) {
      const key =
        next.segments
          .flatMap((item) => item.keys)
          .find((item) => item.id === cursorFocusOverrideId(selected.id)) ??
        next.segments.flatMap((item) => item.keys).find((item) => item.id === selected.id);
      if (key) select(key.id, key.time);
    }
  };
  const field = (
    label: string,
    value: number,
    onChange: (value: number) => void,
    disabled = false,
    bounds: { min?: number | undefined; max?: number | undefined } = {}
  ) => (
    <ReviewNumberRow
      label={label}
      value={value}
      onChange={onChange}
      disabled={disabled || props.disabled}
      min={bounds.min ?? 0}
      max={bounds.max ?? 1}
      step={0.01}
      precision={4}
    />
  );
  return { keys, select, segment, selected, constrained, controls, editable, change, field };
}
type CursorEditorState = ReturnType<typeof cursorEditorState>;

export function ReviewCursorPathEditor(props: CursorPathEditorProps) {
  const state = cursorEditorState(props);
  const { selected, segment, field, editable, change } = state;
  return (
    <fieldset
      disabled={props.disabled}
      className="m-0 min-w-0 border-0 p-0"
      data-ui="cursorFocusPath.inspector"
    >
      <ReviewInspectorSections
        sections={[
          {
            id: 'position',
            label: translate('videoEditor.sidebar.cursorFocusKey'),
            icon: MousePointer2,
            content: <CursorPositionFields state={state} />,
          },
          ...(selected
            ? [
                {
                  id: 'timing',
                  label: translate('gallery.videoReview.interval'),
                  icon: Clock3,
                  content: field(
                    translate('videoEditor.sidebar.actionTimePrefix'),
                    selected.time,
                    (time) => change({ time }),
                    !editable,
                    { min: segment?.start, max: segment?.end }
                  ),
                },
              ]
            : []),
          reviewInspectorActions(<CursorKeyActions state={state} props={props} />),
        ]}
      />
    </fieldset>
  );
}

function CursorKeyActions({
  state,
  props,
}: {
  state: CursorEditorState;
  props: CursorPathEditorProps;
}) {
  const { keys, selected, segment, select } = state;
  return (
    <>
      {([-1, 1] as const).map((direction) => {
        const next = adjacentCursorFocusKey(keys, selected?.id, props.time, direction);
        return (
          <ReviewButton
            key={direction}
            className={reviewTextButtonClassName}
            label={translate(
              direction === -1
                ? 'videoEditor.sidebar.cursorFocusPrevious'
                : 'videoEditor.sidebar.cursorFocusNext'
            )}
            disabled={!next || props.disabled}
            onClick={() => next && select(next.id, next.sourceTime)}
          />
        );
      })}
      <ReviewButton
        className={reviewTextButtonClassName}
        label={translate('videoEditor.sidebar.cursorFocusAdd')}
        disabled={props.disabled || (!segment && props.duration === undefined)}
        onClick={() => {
          const id = crypto.randomUUID();
          const duration =
            props.duration ?? Math.max(props.time, ...props.path.segments.map((item) => item.end));
          props.onChange(addReviewCursorFocusKey(props.path, props.time, duration, id));
          select(id, props.time);
        }}
      />
      <ReviewButton
        className={reviewTextButtonClassName}
        label={translate('common.actions.delete')}
        disabled={props.disabled || selected?.anchor !== 'manual'}
        onClick={() => selected && props.onChange(deleteCursorFocusKey(props.path, selected.id))}
      />
    </>
  );
}
function CursorPositionFields({ state }: { state: CursorEditorState }) {
  const { selected, keys, select, field, editable, change, constrained, controls } = state;
  return selected ? (
    <>
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('videoEditor.sidebar.cursorFocusKey')}
        value={selected.id}
        options={keys.map((key) => {
          const kind = translate(
            key.anchor === 'manual'
              ? 'videoEditor.sidebar.cursorFocusManualKey'
              : 'videoEditor.sidebar.cursorFocusRecordedKey'
          );
          return {
            value: key.id,
            label: `${kind} · ${formatNumber(key.sourceTime, { maximumFractionDigits: 3 })}`,
          };
        })}
        onChange={(id) => {
          const key = keys.find((item) => item.id === id);
          if (key) select(key.id, key.sourceTime);
        }}
      />
      {field('X', selected.x, (x) => change({ x }), !editable)}
      {field('Y', selected.y, (y) => change({ y }), !editable)}
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('videoEditor.sidebar.cursorFocusCurve')}
        value={selected.interpolation}
        options={(['linear', 'smooth', 'hold'] as const).map((value) => ({
          value,
          label: translate(
            value === 'linear'
              ? 'videoEditor.sidebar.cursorFocusLinear'
              : value === 'smooth'
                ? 'videoEditor.sidebar.cursorFocusSmooth'
                : 'videoEditor.sidebar.cursorFocusHold'
          ),
        }))}
        onChange={(interpolation) => change({ interpolation })}
      />
      {constrained ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.sidebar.cursorFocusConstrained')}
        </p>
      ) : null}
      <ReviewDetails
        preferenceId="cursor-focus-handles"
        label={translate('videoEditor.sidebar.cursorFocusHandles')}
        icon={SlidersHorizontal}
      >
        {(['incoming', 'outgoing'] as const).map((handle) => (
          <div key={handle}>
            {(['x', 'y'] as const).map((axis) => (
              <div key={axis}>
                {field(
                  [
                    translate(
                      handle === 'incoming'
                        ? 'videoEditor.sidebar.cursorFocusIncoming'
                        : 'videoEditor.sidebar.cursorFocusOutgoing'
                    ),
                    axis.toUpperCase(),
                  ].join(' '),
                  controls[handle]?.[axis] ?? selected[axis],
                  (value) =>
                    change({
                      [handle]: {
                        ...(controls[handle] ?? { x: selected.x, y: selected.y }),
                        [axis]: value,
                      },
                    }),
                  false,
                  { min: -4, max: 5 }
                )}
              </div>
            ))}
          </div>
        ))}
      </ReviewDetails>
    </>
  ) : (
    <p className="text-xs text-[var(--sniptale-color-text-muted)]">
      {translate('videoEditor.sidebar.cursorFocusUnavailable')}
    </p>
  );
}

/** Scene owns policy for the entire path; selected-point geometry is contextual. */
export function ReviewCursorPathSettings(props: {
  cameraFollowDefaults?: CameraFollowSettings | undefined;
  onPolicyChange?(settings: CameraFollowSettings | undefined): void;
  path: CursorFocusPath;
  disabled: boolean;
  onChange(path: CursorFocusPath | undefined): void;
}) {
  return (
    <fieldset
      disabled={props.disabled}
      className="m-0 min-w-0 border-0 p-0"
      data-ui="cursorFocusPath.settings"
    >
      <ReviewInspectorSections
        sections={[
          {
            id: 'cursor-path',
            icon: Navigation,
            label: translate('videoEditor.sidebar.cursorFocusPathTitle'),
            content: (
              <>
                <SelectField
                  className={reviewSelectFieldClassName}
                  label={translate('videoEditor.sidebar.cursorFocusMode')}
                  value={props.path.mode}
                  options={[
                    { value: 'fixed', label: translate('videoEditor.sidebar.cursorFocusFixed') },
                    { value: 'follow', label: translate('videoEditor.sidebar.cursorFocusFollow') },
                  ]}
                  onChange={(mode) => props.onChange({ ...props.path, mode })}
                />
                <ReviewCameraFollowSettings
                  global
                  settings={
                    resolveCameraFollowPolicy({
                      legacySensitivity: props.path.sensitivity,
                      ...(props.cameraFollowDefaults
                        ? { defaults: props.cameraFollowDefaults }
                        : {}),
                    }).settings
                  }
                  inherited={!props.cameraFollowDefaults}
                  disabled={props.disabled || !props.onPolicyChange}
                  legacySensitivity={props.path.sensitivity}
                  onChange={(settings) => props.onPolicyChange?.(settings)}
                  onReset={() => props.onPolicyChange?.(undefined)}
                />
                <ReviewDetails
                  preferenceId="cursor-path-policy"
                  icon={SlidersHorizontal}
                  label={translate('videoEditor.sidebar.framingFineTune')}
                >
                  <ReviewNumberRow
                    label={translate('videoEditor.sidebar.cursorFocusSmoothing')}
                    value={props.path.smoothing}
                    min={0}
                    max={1}
                    step={0.01}
                    precision={2}
                    disabled={props.disabled}
                    onChange={(smoothing) => props.onChange({ ...props.path, smoothing })}
                  />
                </ReviewDetails>
                <ReviewButton
                  label={translate('videoEditor.sidebar.cursorFocusReset')}
                  className={reviewTextButtonClassName}
                  disabled={props.disabled}
                  onClick={() => props.onChange(undefined)}
                />
              </>
            ),
          },
        ]}
      />
    </fieldset>
  );
}

/** Policy controls reuse the review inspector's numeric, select, switch, and disclosure owners. */
export function ReviewCameraFollowSettings(props: {
  global?: boolean;
  settings: CameraFollowSettings;
  inherited: boolean;
  disabled?: boolean;
  legacySensitivity: number;
  onChange(settings: CameraFollowSettings): void;
  onReset(): void;
}) {
  const settings = props.settings;
  const label = (key: Parameters<typeof translate>[0]) => translate(key);
  const update = (patch: Partial<CameraFollowSettings>, movement = false) => {
    const { legacySensitivity: legacy, ...current } = settings;
    props.onChange({
      ...current,
      ...(!movement && legacy !== undefined ? { legacySensitivity: legacy } : {}),
      ...patch,
    });
  };
  const number = (
    name:
      | 'zoneSize'
      | 'transitionDuration'
      | 'marginFraction'
      | 'minimumHoldDuration'
      | 'minimumScale',
    key: Parameters<typeof translate>[0],
    min: number,
    max: number,
    factor = 1,
    unit: '' | '%' | 's' = ''
  ) => (
    <ReviewNumberRow
      key={name}
      label={label(key)}
      value={settings[name] * factor}
      min={min}
      max={max}
      step={factor === 100 ? 1 : 0.05}
      precision={factor === 100 ? 0 : 2}
      unit={unit}
      disabled={props.disabled ?? false}
      onChange={(value) =>
        update(
          { [name]: value / factor },
          name === 'transitionDuration' || name === 'minimumHoldDuration'
        )
      }
    />
  );
  const toggle = (
    name: 'preservePointer' | 'allowExpansion',
    key: Parameters<typeof translate>[0]
  ) => (
    <div className="flex min-w-0 items-center justify-between gap-2" key={name}>
      <span className="text-xs">{label(key)}</span>
      <ProductGlassSwitch
        role="switch"
        aria-label={label(key)}
        aria-checked={settings[name]}
        on={settings[name]}
        disabled={props.disabled}
        onClick={() => update({ [name]: !settings[name] })}
      />
    </div>
  );
  return (
    <fieldset
      disabled={props.disabled}
      className="m-0 min-w-0 space-y-2 border-0 p-0"
      data-ui="cameraFollow.settings"
    >
      <p className="text-xs text-[var(--sniptale-color-text-muted)]">
        {label(
          props.global
            ? 'videoEditor.sidebar.cameraDefaults'
            : props.inherited
              ? 'videoEditor.sidebar.cameraInherited'
              : 'videoEditor.sidebar.cameraOverride'
        )}
      </p>
      {number('zoneSize', 'videoEditor.sidebar.cameraZoneSize', 10, 100, 100, '%')}
      <p className="text-xs text-[var(--sniptale-color-text-muted)]">
        {label('videoEditor.sidebar.cameraZoneHints')}
      </p>
      <SelectField
        className={reviewSelectFieldClassName}
        label={label('videoEditor.sidebar.cameraMovement')}
        value={cameraFollowPreset(settings)}
        options={[
          { value: 'legacy', label: label('videoEditor.sidebar.cameraLegacy') },
          { value: 'calm', label: label('videoEditor.sidebar.cameraCalm') },
          { value: 'balanced', label: label('videoEditor.sidebar.cameraBalanced') },
          { value: 'fast', label: label('videoEditor.sidebar.cameraFast') },
          { value: 'custom', label: label('videoEditor.sidebar.cameraCustom'), disabled: true },
        ]}
        onChange={(preset) => {
          if (preset === 'legacy')
            props.onChange({
              ...settings,
              ...resolveCameraFollowPolicy({ legacySensitivity: props.legacySensitivity }).settings,
              zoneSize: settings.zoneSize,
              preservePointer: settings.preservePointer,
              allowExpansion: settings.allowExpansion,
              minimumScale: settings.minimumScale,
            });
          else if (preset !== 'custom') props.onChange(applyCameraFollowPreset(settings, preset));
        }}
      />
      {toggle('preservePointer', 'videoEditor.sidebar.cameraPreservePointer')}
      {toggle('allowExpansion', 'videoEditor.sidebar.cameraAllowExpansion')}
      <ReviewDetails
        label={label('videoEditor.sidebar.framingFineTune')}
        preferenceId="camera-follow-advanced"
      >
        {number(
          'transitionDuration',
          'videoEditor.sidebar.cameraTransitionDuration',
          0.05,
          5,
          1,
          's'
        )}
        {number('marginFraction', 'videoEditor.sidebar.cameraMargin', 0, 30, 100, '%')}
        {number('minimumHoldDuration', 'videoEditor.sidebar.cameraMinimumHold', 0, 5, 1, 's')}
        {settings.allowExpansion
          ? number('minimumScale', 'videoEditor.sidebar.cameraMinimumScale', 1, 4)
          : null}
      </ReviewDetails>
      <ReviewButton
        label={label(
          props.global
            ? 'videoEditor.sidebar.cameraResetDefaults'
            : 'videoEditor.sidebar.cameraResetPolicy'
        )}
        className={reviewTextButtonClassName}
        disabled={props.inherited || props.disabled}
        onClick={props.onReset}
      />
    </fieldset>
  );
}
