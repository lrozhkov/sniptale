import { AudioLines, RotateCcw } from 'lucide-react';
import type {
  VideoProject,
  VideoProjectAudioClip,
} from '../../../../../features/video/project/types/model';
import type { VideoProjectVoicePlacement } from '../../../../../features/video/project/text/authoring';
import {
  listProjectOriginalAudioTargets,
  updateProjectOriginalAudioVolume,
} from '../../../../../features/video/project/timeline/original-audio';
import { translate, useAppLocale } from '../../../../../platform/i18n';
import { SegmentedRow } from '../../../../../ui/compact-inspector-controls';
import { useVideoEditorTimelineEditingPort } from '../../../../runtime/controller/store';
import { InspectorDetails } from '../shared/details';
import { InspectorActionButton } from '../shared/actions';
import { SliderField } from '../shared/sliders';

type Mute = NonNullable<VideoProjectVoicePlacement['originalAudioMute']>;
const targetKey = (target: Mute['targets'][number]) =>
  JSON.stringify([target.assetId, target.sourceInstanceId]);
function describeSource(project: VideoProject, target: Mute['targets'][number]) {
  const clip = project.clips.find(
    (clip) =>
      (clip.type === 'AUDIO' || clip.type === 'VIDEO') &&
      clip.assetId === target.assetId &&
      (clip.sourceInstanceId ?? clip.id) === target.sourceInstanceId
  );
  return {
    name:
      clip?.name ??
      project.assets.find((asset) => asset.id === target.assetId)?.name ??
      translate('videoEditor.sidebar.originalAudioMissingSource'),
    track: clip ? project.tracks.find((track) => track.id === clip.trackId)?.name : undefined,
  };
}

/** Deferred placement choices stay local until the existing voice Apply command. */
export function OriginalAudioPlacementFields(props: {
  project: VideoProject;
  value: VideoProjectVoicePlacement['originalAudioMute'];
  disabled: boolean;
  onChange(value: VideoProjectVoicePlacement['originalAudioMute']): void;
}) {
  useAppLocale();
  const candidates = listProjectOriginalAudioTargets(props.project);
  const available = new Set(candidates.map(targetKey));
  const choices = [
    ...candidates,
    ...(props.value?.targets.filter((target) => !available.has(targetKey(target))) ?? []),
  ];
  const mode = props.value ? (props.value.volume === 0 ? 'mute' : 'attenuate') : 'keep';
  return (
    <div
      className="sniptale-parameter-stack min-w-0"
      data-ui="video-editor.original-audio.placement"
    >
      <SegmentedRow
        label={translate('videoEditor.sidebar.originalAudio')}
        ariaLabel={translate('videoEditor.sidebar.originalAudio')}
        value={mode}
        options={[
          {
            value: 'keep',
            label: translate('videoEditor.sidebar.originalAudioKeep'),
            disabled: props.disabled,
          },
          {
            value: 'attenuate',
            label: translate('videoEditor.sidebar.originalAudioAttenuate'),
            disabled: props.disabled || !candidates.length,
          },
          {
            value: 'mute',
            label: translate('videoEditor.sidebar.originalAudioMute'),
            disabled: props.disabled || !candidates.length,
          },
        ]}
        onChange={(next) =>
          props.onChange(
            next === 'keep'
              ? undefined
              : { volume: next === 'mute' ? 0 : 0.25, targets: props.value?.targets ?? [] }
          )
        }
      />
      {props.value ? (
        <>
          <fieldset
            aria-label={translate('videoEditor.sidebar.originalAudioSources')}
            className="max-h-40 min-w-0 space-y-1 overflow-y-auto"
          >
            {choices.map((target) => {
              const checked = props.value!.targets.some(
                (item) => targetKey(item) === targetKey(target)
              );
              const source = describeSource(props.project, target);
              const unavailable = !available.has(targetKey(target));
              const context = unavailable
                ? source.name === translate('videoEditor.sidebar.originalAudioMissingSource')
                  ? undefined
                  : translate('videoEditor.sidebar.originalAudioMissingSource')
                : source.track;
              return (
                <label
                  key={targetKey(target)}
                  className="flex min-h-8 min-w-0 items-start gap-2 text-xs"
                  title={source.name}
                >
                  <input
                    type="checkbox"
                    className="sniptale-parameter-check shrink-0"
                    checked={checked}
                    disabled={props.disabled || (!checked && props.value!.targets.length >= 512)}
                    onChange={() =>
                      props.onChange({
                        ...props.value!,
                        targets: checked
                          ? props.value!.targets.filter(
                              (item) => targetKey(item) !== targetKey(target)
                            )
                          : [...props.value!.targets, target],
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 break-words">
                    <span className="block">{source.name}</span>
                    <span className="block text-[var(--sniptale-color-text-secondary)]">
                      {context}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          {mode === 'attenuate' ? (
            <OriginalAudioLevel
              value={props.value.volume}
              min={0.01}
              disabled={props.disabled}
              onChange={(volume) => props.onChange({ ...props.value!, volume })}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function OriginalAudioLevel(props: {
  value: number;
  min?: number;
  disabled: boolean;
  onChange(volume: number): void;
}) {
  return (
    <SliderField
      label={translate('videoEditor.sidebar.originalAudioLevel')}
      disabled={props.disabled}
      min={props.min ?? 0}
      max={1}
      step={0.01}
      value={props.value}
      onChange={props.onChange}
      formatValue={(value) => `${Math.round(value * 100)}%`}
    />
  );
}

/** Existing take controls use the existing project/history writer and preserve manual gain. */
export function ProjectOriginalAudioEditor({
  project,
  clip,
  disabled,
}: {
  project: VideoProject;
  clip: VideoProjectAudioClip;
  disabled: boolean;
}) {
  useAppLocale();
  const updateProject = useVideoEditorTimelineEditingPort((port) => port.updateProject);
  const mute = clip.originalAudioMute;
  if (!mute) return null;
  const change = (volume: number | undefined) => {
    let changed = false;
    updateProject((current) => {
      const next =
        current === project && !disabled
          ? updateProjectOriginalAudioVolume(current, clip.id, volume)
          : current;
      changed = next !== current;
      return next;
    });
    return changed;
  };
  return (
    <InspectorDetails
      preferenceId="audio-fields:original-audio"
      label={translate('videoEditor.sidebar.originalAudio')}
    >
      <div
        className="sniptale-parameter-stack min-w-0"
        data-ui="video-editor.original-audio.existing"
      >
        <ul
          className="max-h-40 min-w-0 space-y-1 overflow-y-auto text-xs"
          aria-label={translate('videoEditor.sidebar.originalAudioSources')}
        >
          {mute.targets.map((target) => {
            const source = describeSource(project, target);
            return (
              <li key={targetKey(target)} className="flex min-w-0 items-start gap-2">
                <AudioLines size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span className="min-w-0 break-words" title={source.name}>
                  {source.name}
                  <span className="block text-[var(--sniptale-color-text-secondary)]">
                    {source.track}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        <OriginalAudioLevel value={mute.volume} disabled={disabled} onChange={change} />
        <InspectorActionButton
          disabled={disabled}
          onClick={(event) => {
            const section = event.currentTarget.closest('[data-section]');
            const fallback = [...(section?.querySelectorAll<HTMLInputElement>('input') ?? [])].find(
              (input) =>
                input.getAttribute('aria-label') === translate('videoEditor.sidebar.volumeLabel')
            );
            if (change(undefined)) fallback?.focus();
          }}
        >
          <RotateCcw size={14} aria-hidden="true" />
          {translate('videoEditor.sidebar.originalAudioRestore')}
        </InspectorActionButton>
      </div>
    </InspectorDetails>
  );
}
