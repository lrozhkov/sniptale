import {
  CameraFollowMovementChoice,
  CameraFollowZoneChoice,
} from '../../ui/camera-follow-segment-controls';
import type { ReactNode } from 'react';
import {
  resolveCameraFollowPolicy,
  type CameraFollowSettings,
} from '../../features/video/project/camera/cursor-policy';
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
import { Clock3, MousePointer2, SlidersHorizontal } from 'lucide-react';
import { SegmentedRow, SelectField, ToggleField } from '../../ui/compact-inspector-controls';
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
  recordedKey?:
    | import('../../features/video/project/cursor-focus-path/timeline').CursorFocusTimelineKey
    | undefined;
  onSelect?(id: string, time: number): void;
  disabled: boolean;
  onChange(path: CursorFocusPath | undefined): void;
}

function cursorEditorState(props: CursorPathEditorProps) {
  const keys = reviewCursorFocusTimelineKeys(props.path).filter(
    (key) => key.anchor === 'manual' || key.authored || key.id === props.selectedKeyId
  );
  if (props.recordedKey && !keys.some((key) => key.id === props.recordedKey!.id))
    keys.push(props.recordedKey);
  const select = (id: string, time: number) =>
    props.onSelect ? props.onSelect(id, time) : props.onSeek?.(time);
  const segment =
    props.path.segments.find((item) => item.keys.some((key) => key.id === props.selectedKeyId)) ??
    props.path.segments.find((item) => props.time >= item.start && props.time <= item.end);
  const selected =
    props.recordedKey ?? segment?.keys.find((key) => key.id === props.selectedKeyId) ?? undefined;
  const constrained = evaluateReviewCursorFocus(props.path, props.time)?.constrained;
  const controls =
    selected && segment
      ? cursorFocusKeyControls(segment, selected.id, props.path.smoothing)
      : { incoming: undefined, outgoing: undefined };
  const editable = selected !== undefined;
  const change = (patch: Parameters<typeof updateCursorFocusKey>[2]) => {
    if (!selected) return;
    const base =
      segment && !segment.keys.some((key) => key.id === selected.id)
        ? {
            ...props.path,
            segments: props.path.segments.map((item) =>
              item.id === segment.id
                ? { ...item, keys: [...item.keys, selected].sort(compareCursorFocusKeys) }
                : item
            ),
          }
        : props.path;
    const next = updateCursorFocusKey(base, selected.id, patch);
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
        const next = adjacentCursorFocusKey(
          keys.filter((key) => key.anchor === 'manual' || key.authored),
          selected?.id,
          props.time,
          direction
        );
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
            key.anchor === 'manual' || key.authored
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
      className="sniptale-parameter-stack m-0 min-w-0 border-0 p-0"
      data-ui="cursorFocusPath.settings"
    >
      <SegmentedRow
        label={translate('videoEditor.sidebar.cursorFocusMode')}
        columns={2}
        ariaLabel={translate('videoEditor.sidebar.cursorFocusMode')}
        value={props.path.mode}
        options={[
          { value: 'fixed', label: translate('videoEditor.sidebar.cursorFocusFixed') },
          {
            value: 'follow',
            label: translate('videoEditor.sidebar.cursorFocusFollow'),
          },
        ]}
        onChange={(mode) => props.onChange({ ...props.path, mode })}
      />
      <ReviewCameraFollowSettings
        global
        settings={
          resolveCameraFollowPolicy({
            legacySensitivity: props.path.sensitivity,
            ...(props.cameraFollowDefaults ? { defaults: props.cameraFollowDefaults } : {}),
          }).settings
        }
        inherited={!props.cameraFollowDefaults}
        disabled={props.disabled || !props.onPolicyChange}
        legacySensitivity={props.path.sensitivity}
        onChange={(settings) => props.onPolicyChange?.(settings)}
        onReset={() => props.onPolicyChange?.(undefined)}
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
      </ReviewCameraFollowSettings>

      <ReviewButton
        label={translate('videoEditor.sidebar.cursorFocusReset')}
        className={reviewTextButtonClassName}
        disabled={props.disabled}
        onClick={() => props.onChange(undefined)}
      />
    </fieldset>
  );
}

/** Policy controls reuse the review inspector's numeric, select, switch, and disclosure owners. */
export function ReviewCameraFollowSettings(props: {
  global?: boolean;
  children?: ReactNode;
  settings: CameraFollowSettings;
  inherited: boolean;
  disabled?: boolean;
  legacySensitivity: number;
  onChange(settings: CameraFollowSettings): void;
  onReset(): void;
}) {
  const settings = props.settings;
  const label = (key: Parameters<typeof translate>[0]) => translate(key);
  const update = (patch: Partial<CameraFollowSettings>) =>
    props.onChange({ ...settings, ...patch });
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
      onChange={(value) => update({ [name]: value / factor })}
    />
  );
  const toggle = (
    name: 'preservePointer' | 'allowExpansion',
    key: Parameters<typeof translate>[0]
  ) => (
    <ToggleField
      key={name}
      label={label(key)}
      value={settings[name]}
      disabled={props.disabled}
      onChange={(value) => update({ [name]: value })}
    />
  );
  return (
    <fieldset className="sniptale-parameter-stack m-0 border-0 p-0" data-ui="cameraFollow.settings">
      <CameraFollowZoneChoice
        settings={settings}
        disabled={props.disabled}
        onChange={props.onChange}
        showLabel
      />
      <CameraFollowMovementChoice
        settings={settings}
        disabled={props.disabled}
        onChange={props.onChange}
        showLabel
      />
      <ReviewDetails
        label={label('videoEditor.sidebar.framingFineTune')}
        icon={SlidersHorizontal}
        preferenceId="camera-follow-advanced"
      >
        {props.children}
        <ReviewNumberRow
          label={label('videoEditor.sidebar.cameraZoneSize')}
          value={settings.zoneSize * 100}
          unit="%"
          min={10}
          max={100}
          step={1}
          disabled={props.disabled ?? false}
          onChange={(value) => update({ zoneSize: value / 100 })}
        />
        {toggle('preservePointer', 'videoEditor.sidebar.cameraPreservePointer')}
        {toggle('allowExpansion', 'videoEditor.sidebar.cameraAllowExpansion')}

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
