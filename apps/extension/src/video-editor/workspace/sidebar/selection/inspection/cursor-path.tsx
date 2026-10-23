import {
  CameraFollowMovementChoice,
  CameraFollowZoneChoice,
} from '../../../../../ui/camera-follow-segment-controls';
import { SegmentedRow } from '../../../../../ui/compact-inspector-controls';
import type { ReactNode } from 'react';
import {
  resolveCameraFollowPolicy,
  type CameraFollowSettings,
} from '../../../../../features/video/project/camera/cursor-policy';
import { SliderField } from '../shared/sliders';
import { getVideoProjectUtilityLanes } from '../../../../../features/video/project/utility-lanes';
import {
  projectCursorFocusTimelineKeys,
  adjacentCursorFocusKey,
} from '../../../../../features/video/project/cursor-focus-path/timeline';
import { cursorFocusKeyControls } from '../../../../../features/video/project/cursor-focus-path/evaluator';
import {
  useVideoEditorTimelineEditingPort,
  useVideoEditorPlaybackPort,
  useVideoEditorClipSelectionPort,
} from '../../../../runtime/controller/store';
import {
  resolveProjectCursorFocusPath,
  resolveProjectCursorFocus,
  addProjectCursorFocusKey,
} from '../../../../../features/video/project/cursor-focus-path/projection';
import {
  updateCursorFocusKey,
  cursorFocusOverrideId,
  deleteCursorFocusKey,
  authoredCursorFocusPath,
} from '../../../../../features/video/project/cursor-focus-path/authoring';
import type { CursorFocusPath } from '../../../../../features/video/project/cursor-focus-path/types';
import type { VideoProject } from '../../../../../features/video/project/types';
import { applyVideoProjectMutationPatch } from '../../../../../features/video/project/mutation';
import { translate, formatNumber } from '../../../../../platform/i18n';
import { NumberInput } from '../inputs/number';
import { SelectInput, ToggleField } from '../shared/controls';
import { OptionButtonsField } from '../shared/option-buttons';
import { InspectorActionButton } from '../shared/actions';
import { InspectorDetails } from '../shared/details';
import { SlidersHorizontal } from 'lucide-react';

/** Authoring edits use the existing project mutation/history authority. */
interface CursorInspectorProps {
  project: VideoProject;
  sampleId: string;
  time: number;
}

function useCursorInspector(props: CursorInspectorProps) {
  const selectCursorSegment = useVideoEditorClipSelectionPort((port) => port.selectCursorSegment);
  const updateProject = useVideoEditorTimelineEditingPort((port) => port.updateProject);
  const setCurrentTime = useVideoEditorPlaybackPort((port) => port.setCurrentTime);
  const keys = projectCursorFocusTimelineKeys(props.project);
  const selectKey = (id: string) => {
    const item = keys
      .filter((key) => key.id === id)
      .toSorted((a, b) => Math.abs(a.time - props.time) - Math.abs(b.time - props.time))[0];
    if (item) {
      selectCursorSegment(id);
      setCurrentTime(item.time);
    }
  };
  const path = resolveProjectCursorFocusPath(props.project, props.sampleId);
  const segment = path.segments.find((item) => item.keys.some((key) => key.id === props.sampleId));
  const key = segment?.keys.find((item) => item.id === props.sampleId);
  const locked = getVideoProjectUtilityLanes(props.project).actions.locked;
  const change = (next: CursorFocusPath | undefined) => {
    let applied = false;
    updateProject((project) => {
      if (getVideoProjectUtilityLanes(project).actions.locked) return project;
      applied = true;
      const { cursorFocusPath: _previous, ...rest } = project;
      return applyVideoProjectMutationPatch(
        rest,
        next
          ? {
              cursorFocusPath: authoredCursorFocusPath(next),
              ...(next.mode !== path.mode
                ? {
                    motionRegions:
                      project.motionRegions?.map((region) => ({
                        ...region,
                        focusMode:
                          next.mode === 'follow' ? ('CURSOR' as const) : ('MANUAL' as const),
                      })) ?? [],
                  }
                : {}),
            }
          : {}
      );
    });
    return applied;
  };
  const patch = (value: Parameters<typeof updateCursorFocusKey>[2]) => {
    if (!key) return;
    const next = updateCursorFocusKey(path, key.id, value);
    if (!change(next)) return;
    const override = next.segments
      .flatMap((item) => item.keys)
      .find((item) => item.id === cursorFocusOverrideId(key.id));
    if (override && (value.time !== undefined || value.x !== undefined || value.y !== undefined)) {
      selectCursorSegment(override.id);
      const occurrence = projectCursorFocusTimelineKeys({
        ...props.project,
        cursorFocusPath: authoredCursorFocusPath(next),
      }).find((item) => item.id === override.id);
      if (occurrence) setCurrentTime(occurrence.time);
    }
  };
  const controls =
    key && segment
      ? cursorFocusKeyControls(segment, key.id, path.smoothing)
      : { incoming: undefined, outgoing: undefined };
  const editable = key !== undefined && !locked;
  return {
    keys,
    selectKey,
    path,
    segment,
    key,
    change,
    patch,
    controls,
    editable,
    locked,
    selectCursorSegment,
  };
}

export function InspectCursorPath(props: CursorInspectorProps) {
  const state = useCursorInspector(props);
  const { path, selectKey } = state;
  return (
    <div
      className="sniptale-parameter-stack space-y-3"
      data-ui="cursorFocusPath.inspector"
      title={
        props.project.cursorTrack?.captureMode === 'embedded-fallback'
          ? translate('videoEditor.sidebar.cursorFocusEmbedded')
          : undefined
      }
    >
      <SelectInput
        label={translate('videoEditor.sidebar.cursorFocusKey')}
        value={props.sampleId}
        options={path.segments
          .flatMap((item) => item.keys)

          .map((item) => {
            const kind = translate(
              item.anchor === 'manual'
                ? 'videoEditor.sidebar.cursorFocusManualKey'
                : 'videoEditor.sidebar.cursorFocusRecordedKey'
            );
            return {
              value: item.id,
              label: `${kind} · ${formatNumber(item.time, { maximumFractionDigits: 2 })}`,
            };
          })}
        onChange={selectKey}
      />
      {resolveProjectCursorFocus(props.project, props.time, path)?.constrained ? (
        <span role="status" className="block text-xs">
          {translate('videoEditor.sidebar.cursorFocusConstrained')}
        </span>
      ) : null}
      <CursorInspectorGeometry state={state} />
      <CursorInspectorActions state={state} props={props} />
    </div>
  );
}

/** Global follow policy is edited from Scene rather than an individual source point. */
export function InspectCursorPathSettings({ project }: { project: VideoProject }) {
  const updateProject = useVideoEditorTimelineEditingPort((port) => port.updateProject);
  const path = resolveProjectCursorFocusPath(project);
  const locked = getVideoProjectUtilityLanes(project).actions.locked;
  const change = (next: CursorFocusPath | undefined) =>
    updateProject((current) => {
      if (getVideoProjectUtilityLanes(current).actions.locked) return current;
      const { cursorFocusPath: _previous, ...rest } = current;
      return applyVideoProjectMutationPatch(
        rest,
        next
          ? {
              cursorFocusPath: authoredCursorFocusPath(next),
              ...(next.mode !== path.mode
                ? {
                    motionRegions:
                      current.motionRegions?.map((region) => ({
                        ...region,
                        focusMode:
                          next.mode === 'follow' ? ('CURSOR' as const) : ('MANUAL' as const),
                      })) ?? [],
                  }
                : {}),
            }
          : {}
      );
    });
  return (
    <fieldset
      className="sniptale-parameter-stack m-0 min-w-0 border-0 p-0"
      data-ui="cursorFocusPath.settings"
    >
      <SegmentedRow
        label={translate('videoEditor.sidebar.cursorFocusMode')}
        columns={2}
        ariaLabel={translate('videoEditor.sidebar.cursorFocusMode')}
        value={path.mode}
        options={[
          {
            value: 'fixed',
            label: translate('videoEditor.sidebar.cursorFocusFixed'),
            disabled: locked,
          },
          {
            value: 'follow',
            label: translate('videoEditor.sidebar.cursorFocusFollow'),
            disabled: locked,
          },
        ]}
        onChange={(mode) => change({ ...path, mode })}
      />
      <InspectCameraFollowSettings
        global
        settings={
          resolveCameraFollowPolicy({
            legacySensitivity: path.sensitivity,
            ...(project.cameraFollowDefaults ? { defaults: project.cameraFollowDefaults } : {}),
          }).settings
        }
        inherited={!project.cameraFollowDefaults}
        disabled={getVideoProjectUtilityLanes(project).camera.locked}
        legacySensitivity={path.sensitivity}
        onChange={(cameraFollowDefaults) =>
          updateProject((current) => {
            if (getVideoProjectUtilityLanes(current).camera.locked) return current;
            const { cameraFollowDefaults: _previous, ...rest } = current;
            return applyVideoProjectMutationPatch(
              rest,
              cameraFollowDefaults ? { cameraFollowDefaults } : {}
            );
          })
        }
      >
        <NumberInput
          disabled={locked}
          label={translate('videoEditor.sidebar.cursorFocusSmoothing')}
          value={path.smoothing}
          min={0}
          max={1}
          step={0.01}
          scrub={false}
          onChange={(smoothing) => change({ ...path, smoothing })}
        />
      </InspectCameraFollowSettings>

      <InspectorActionButton compact disabled={locked} onClick={() => change(undefined)}>
        {translate('videoEditor.sidebar.cursorFocusReset')}
      </InspectorActionButton>
    </fieldset>
  );
}

type CursorInspectorState = ReturnType<typeof useCursorInspector>;
function CursorInspectorGeometry({ state }: { state: CursorInspectorState }) {
  const { key, segment, editable, patch, controls } = state;
  return key && segment ? (
    <>
      <NumberInput
        label={translate('videoEditor.sidebar.actionTimePrefix')}
        value={key.time}
        min={segment.start}
        max={segment.end}
        step={0.01}
        scrub={false}
        disabled={!editable}
        onChange={(time) => patch({ time })}
      />
      <NumberInput
        label="X"
        value={key.x}
        min={0}
        max={1}
        step={0.01}
        scrub={false}
        disabled={!editable}
        onChange={(x) => patch({ x })}
      />
      <NumberInput
        label="Y"
        value={key.y}
        min={0}
        max={1}
        step={0.01}
        scrub={false}
        disabled={!editable}
        onChange={(y) => patch({ y })}
      />
      <OptionButtonsField
        label={translate('videoEditor.sidebar.cursorFocusCurve')}
        value={key.interpolation}
        options={[
          { value: 'linear', label: translate('videoEditor.sidebar.cursorFocusLinear') },
          { value: 'smooth', label: translate('videoEditor.sidebar.cursorFocusSmooth') },
          { value: 'hold', label: translate('videoEditor.sidebar.cursorFocusHold') },
        ]}
        onChange={(interpolation) => patch({ interpolation })}
        disabled={!editable}
      />
      <InspectorDetails
        preferenceId="cursor-focus-handles"
        icon={SlidersHorizontal}
        label={translate('videoEditor.sidebar.cursorFocusHandles')}
      >
        {(['incoming', 'outgoing'] as const).map((handle) => (
          <div key={handle} className="sniptale-parameter-stack space-y-2">
            {(['x', 'y'] as const).map((axis) => (
              <NumberInput
                key={axis}
                label={[
                  translate(
                    handle === 'incoming'
                      ? 'videoEditor.sidebar.cursorFocusIncoming'
                      : 'videoEditor.sidebar.cursorFocusOutgoing'
                  ),
                  axis.toUpperCase(),
                ].join(' ')}
                value={controls[handle]?.[axis] ?? key[axis]}
                min={-4}
                max={5}
                step={0.01}
                scrub={false}
                disabled={!editable}
                onChange={(value) =>
                  patch({
                    [handle]: {
                      ...(controls[handle] ?? { x: key.x, y: key.y }),
                      [axis]: value,
                    },
                  })
                }
              />
            ))}
          </div>
        ))}
      </InspectorDetails>
    </>
  ) : (
    <span className="text-xs">{translate('videoEditor.sidebar.cursorFocusUnavailable')}</span>
  );
}
function CursorInspectorActions({
  state,
  props,
}: {
  state: CursorInspectorState;
  props: CursorInspectorProps;
}) {
  const { keys, key, selectKey, change, selectCursorSegment, path, locked } = state;
  return (
    <div className="flex flex-wrap gap-2">
      {([-1, 1] as const).map((direction) => {
        const next = adjacentCursorFocusKey(keys, props.sampleId, props.time, direction);
        return (
          <InspectorActionButton
            key={direction}
            compact
            disabled={!next}
            onClick={() => next && selectKey(next.id)}
          >
            {translate(
              direction === -1
                ? 'videoEditor.sidebar.cursorFocusPrevious'
                : 'videoEditor.sidebar.cursorFocusNext'
            )}
          </InspectorActionButton>
        );
      })}
      <InspectorActionButton
        compact
        disabled={locked}
        onClick={() => {
          const id = crypto.randomUUID();
          if (change(addProjectCursorFocusKey(props.project, props.time, id)))
            selectCursorSegment(id);
        }}
      >
        {translate('videoEditor.sidebar.cursorFocusAdd')}
      </InspectorActionButton>
      <InspectorActionButton
        compact
        disabled={locked || key?.anchor !== 'manual'}
        onClick={() => key && change(deleteCursorFocusKey(path, key.id))}
      >
        {translate('common.actions.delete')}
      </InspectorActionButton>
    </div>
  );
}

/** Existing inspector controls edit policy through the document history callback. */
export function InspectCameraFollowSettings(props: {
  global?: boolean;
  children?: ReactNode;
  settings: CameraFollowSettings;
  inherited: boolean;
  legacySensitivity: number;
  disabled?: boolean;
  onChange(settings: CameraFollowSettings | undefined): void;
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
    <NumberInput
      key={name}
      label={label(key)}
      value={settings[name] * factor}
      min={min}
      max={max}
      step={factor === 100 ? 1 : 0.05}
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
      checked={settings[name]}
      disabled={props.disabled ?? false}
      onChange={(value) => update({ [name]: value })}
    />
  );
  return (
    <fieldset
      className="sniptale-parameter-stack m-0 min-w-0 space-y-2 border-0 p-0"
      data-ui="cameraFollow.settings"
    >
      <CameraFollowZoneChoice
        showLabel
        settings={settings}
        disabled={props.disabled}
        onChange={props.onChange}
      />
      <CameraFollowMovementChoice
        showLabel
        settings={settings}
        disabled={props.disabled}
        onChange={props.onChange}
      />
      <InspectorDetails
        label={label('videoEditor.sidebar.framingFineTune')}
        icon={SlidersHorizontal}
        preferenceId="camera-follow-advanced"
      >
        {props.children}
        <SliderField
          label={label('videoEditor.sidebar.cameraZoneSize')}
          value={settings.zoneSize * 100}
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
      </InspectorDetails>
      <InspectorActionButton
        compact
        disabled={props.inherited || props.disabled}
        onClick={() => props.onChange(undefined)}
      >
        {label(
          props.global
            ? 'videoEditor.sidebar.cameraResetDefaults'
            : 'videoEditor.sidebar.cameraResetPolicy'
        )}
      </InspectorActionButton>
    </fieldset>
  );
}
