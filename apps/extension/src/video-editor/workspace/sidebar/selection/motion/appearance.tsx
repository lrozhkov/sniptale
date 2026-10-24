import { useEffect } from 'react';
import {
  VideoMotionFocusMode,
  type VideoProjectMotionRegion,
} from '../../../../../features/video/project/types';
import { getMotionBindingCandidates } from '../../../../../features/video/project/motion/source-binding';
import { motionTransitionSettings } from '../../../../../features/video/project/motion/timing';
import type { MotionTransitionPhaseEdit } from '../../../../../features/video/project/motion/transitions';
import type { MotionFocusEdit } from '../../../../../features/video/project/motion/focus-appearance';
import {
  BorderAppearanceFields,
  BorderHoldFields,
  BorderRevealFields,
} from '../../../../../ui/focus-appearance/border';
import {
  SpotlightAppearanceFields,
  SpotlightRevealFields,
} from '../../../../../ui/focus-appearance/spotlight';
import { SegmentedRow } from '../../../../../ui/compact-inspector-controls';
import { PreviewNumericRow } from '../../../../../ui/compact-inspector-controls/numeric-preview';
import { translate } from '../../../../../platform/i18n';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { InspectorDetails } from '../shared/details';
import { MotionTransitionTypeField } from './fields';

type FocusProps = {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
};

/** One accepted snapshot owns previews. Current-project commands own durable partial merges. */
function useFocusEditing({ motionRegion, panel }: FocusProps) {
  const project = panel.typingProject ?? panel.project;
  const preview = panel.onPreviewMotion;
  useEffect(() => () => preview?.(null), [preview, project, motionRegion.id]);
  return {
    preview: (edit: MotionFocusEdit | null, transition?: MotionTransitionPhaseEdit) =>
      preview?.(
        edit
          ? {
              kind: 'focus',
              project,
              regionId: motionRegion.id,
              edit,
              ...(transition ? { transition } : {}),
            }
          : null
      ),
    commit: (edit: MotionFocusEdit, transition?: MotionTransitionPhaseEdit) => {
      preview?.(null);
      panel.onUpdateMotionRegion(motionRegion.id, {
        focusEdit: edit,
        ...(transition ? { motionTransitionPhase: transition } : {}),
      });
    },
  };
}

export function MotionEffectModeField({ motionRegion, panel }: FocusProps) {
  const kind = motionRegion.border
    ? 'border'
    : motionRegion.spotlight?.effect === 'magnify'
      ? 'lens'
      : motionRegion.spotlight
        ? 'spotlight'
        : 'camera';
  return (
    <SegmentedRow<'camera' | 'border' | 'spotlight' | 'lens'>
      columns={4}
      layout="stacked"
      label={translate('gallery.videoReview.focusType')}
      ariaLabel={translate('gallery.videoReview.focusType')}
      value={kind}
      options={[
        { value: 'camera', label: translate('gallery.videoReview.zoomRegionLabel') },
        { value: 'border', label: translate('gallery.videoReview.focusBorder') },
        { value: 'spotlight', label: translate('gallery.videoReview.focusSpotlight') },
        { value: 'lens', label: translate('gallery.videoReview.focusLens') },
      ]}
      onChange={(mode) => {
        const focusEdit: MotionFocusEdit =
          mode === 'camera'
            ? {
                kind: kind === 'spotlight' || kind === 'lens' ? 'spotlight' : 'border',
                enabled: false,
              }
            : mode === 'border'
              ? { kind: 'border', enabled: true }
              : {
                  kind: 'spotlight',
                  enabled: true,
                  settings:
                    mode === 'lens'
                      ? {
                          effect: 'magnify',
                          magnification: motionRegion.spotlight?.magnification ?? 2,
                          lensOptics: motionRegion.spotlight?.lensOptics ?? 'flat',
                          ...(motionRegion.border
                            ? {
                                area: motionRegion.border.area,
                                roundness: motionRegion.border.roundness,
                              }
                            : {}),
                        }
                      : { effect: 'dim' },
                };
        panel.onUpdateMotionRegion(motionRegion.id, {
          focusEdit,
        });
      }}
    />
  );
}

export function MotionFocusFields(props: FocusProps) {
  const editing = useFocusEditing(props);
  const { motionRegion } = props;
  const { border, spotlight } = motionRegion;
  if (!border && !spotlight) return null;
  return (
    <div
      className="sniptale-parameter-stack"
      data-ui={border ? 'video-editor.motion.border' : 'video-editor.motion.spotlight'}
    >
      <MotionFocusTargetFields {...props} onEdit={editing.commit} />
      {spotlight?.effect === 'magnify' ? (
        <SegmentedRow<'fixed' | 'follow'>
          columns={2}
          layout="stacked"
          label={translate('gallery.videoReview.focusLensPlacement')}
          ariaLabel={translate('gallery.videoReview.focusLensPlacement')}
          value={motionRegion.focusMode === VideoMotionFocusMode.CURSOR ? 'follow' : 'fixed'}
          options={[
            { value: 'fixed', label: translate('videoEditor.sidebar.cursorFocusFixed') },
            { value: 'follow', label: translate('videoEditor.sidebar.cursorFocusFollow') },
          ]}
          onChange={(mode) =>
            props.panel.onUpdateMotionRegion(motionRegion.id, {
              focusMode:
                mode === 'follow' ? VideoMotionFocusMode.CURSOR : VideoMotionFocusMode.MANUAL,
            })
          }
        />
      ) : null}
      {border ? (
        <BorderAppearanceFields
          value={border}
          Details={InspectorDetails}
          preferenceId="motion:border:area"
          onChange={(settings) => editing.commit({ kind: 'border', settings })}
          onPreview={(settings) => editing.preview(settings ? { kind: 'border', settings } : null)}
        />
      ) : spotlight ? (
        <SpotlightAppearanceFields
          value={spotlight}
          Details={InspectorDetails}
          preferenceId="motion:spotlight:area"
          onChange={(settings) => editing.commit({ kind: 'spotlight', settings })}
          onPreview={(settings) =>
            editing.preview(settings ? { kind: 'spotlight', settings } : null)
          }
        />
      ) : null}
    </div>
  );
}

function MotionFocusTargetFields(props: FocusProps & { onEdit(edit: MotionFocusEdit): void }) {
  const { motionRegion, panel } = props;
  const { border, spotlight } = motionRegion;
  const kind = border ? 'border' : 'spotlight';
  const target = border ? motionRegion.borderTarget : motionRegion.spotlightTarget;
  const targetLabel = translate(
    border ? 'videoEditor.sidebar.borderTarget' : 'videoEditor.sidebar.spotlightTarget'
  );
  const candidates = getMotionBindingCandidates(panel.project, motionRegion);
  const targetOptions = candidates.map((clip, index) => {
    const sameName = candidates.some((other) => other.id !== clip.id && other.name === clip.name);
    const track = panel.project.tracks.find((item) => item.id === clip.trackId)!;
    return {
      value: clip.id,
      label: sameName ? `${clip.name} · ${track.name} (${index + 1})` : clip.name,
    };
  });
  return (
    <>
      <SegmentedRow
        layout="stacked"
        label={targetLabel}
        ariaLabel={targetLabel}
        value={target === 'viewport' ? '' : (motionRegion.sourceBinding?.clipId ?? '')}
        options={[
          { value: '', label: translate('videoEditor.sidebar.borderTargetViewport') },
          ...targetOptions,
        ]}
        onChange={(value) => {
          panel.onPreviewMotion?.(null);
          const attachment =
            value === ''
              ? 'viewport'
              : target === 'scene' || target === 'source-scene'
                ? target
                : 'window';
          const focusEdit: MotionFocusEdit =
            kind === 'border'
              ? {
                  kind: 'border',
                  target:
                    attachment === 'scene' || attachment === 'source-scene' ? 'window' : attachment,
                }
              : { kind: 'spotlight', target: attachment };
          panel.onUpdateMotionRegion(motionRegion.id, {
            ...(value ? { sourceClipId: value } : {}),
            focusEdit,
          });
        }}
      />
      {spotlight && target !== 'viewport' && motionRegion.sourceBinding ? (
        <SegmentedRow<'window' | 'source-scene' | 'scene'>
          columns={3}
          layout="stacked"
          label={translate('videoEditor.sidebar.spotlightCoverage')}
          ariaLabel={translate('videoEditor.sidebar.spotlightCoverage')}
          value={target === 'scene' || target === 'source-scene' ? target : 'window'}
          options={[
            { value: 'window', label: translate('videoEditor.sidebar.spotlightCoverageWindow') },
            {
              value: 'source-scene',
              label: translate('videoEditor.sidebar.spotlightCoverageSourceScene'),
            },
            { value: 'scene', label: translate('videoEditor.sidebar.spotlightCoverageScene') },
          ]}
          onChange={(target) => props.onEdit({ kind: 'spotlight', target })}
        />
      ) : null}
    </>
  );
}

const PHASE_LABELS = {
  enter: 'gallery.videoReview.zoomTransitionIn',
  hold: 'gallery.videoReview.borderHold',
  exit: 'gallery.videoReview.zoomTransitionOut',
} as const;

/** Appearance roles share Native phase budgets and curves. Only borders have an animated hold. */
export function MotionFocusAnimationFields(props: FocusProps) {
  const editing = useFocusEditing(props);
  const { border, spotlight } = props.motionRegion;
  if (!border && !spotlight) return null;
  const kind = border ? 'border' : 'spotlight';
  const phases: ('enter' | 'hold' | 'exit')[] = border
    ? ['enter', 'hold', 'exit']
    : ['enter', 'exit'];
  return (
    <div
      className="sniptale-parameter-stack"
      data-ui={
        border ? 'video-editor.motion.border-animation' : 'video-editor.motion.spotlight-animation'
      }
    >
      {phases.map((phase) => {
        const label = translate(PHASE_LABELS[phase]);
        return (
          <InspectorDetails
            key={phase}
            preferenceId={`motion:${kind}:${phase}`}
            label={label}
            initiallyOpen
          >
            <fieldset className="min-w-0 sniptale-parameter-stack" aria-label={label}>
              {phase === 'hold' ? (
                border ? (
                  <BorderHoldFields
                    border={border}
                    onChange={(settings) => editing.commit({ kind: 'border', settings })}
                    onPreview={(settings) =>
                      editing.preview(settings ? { kind: 'border', settings } : null)
                    }
                  />
                ) : null
              ) : (
                <MotionFocusPhaseFields {...props} phase={phase} editing={editing} />
              )}
            </fieldset>
          </InspectorDetails>
        );
      })}
    </div>
  );
}

function MotionFocusPhaseFields(
  props: FocusProps & { phase: 'enter' | 'exit'; editing: ReturnType<typeof useFocusEditing> }
) {
  const { motionRegion, phase, editing } = props;
  const { border, spotlight } = motionRegion;
  const kind = border ? 'border' : 'spotlight';
  const clock = motionTransitionSettings(motionRegion, phase);
  const other = motionTransitionSettings(motionRegion, phase === 'enter' ? 'exit' : 'enter');
  const duration =
    motionRegion.sourceBinding?.animation.duration ??
    motionRegion.animation?.duration ??
    motionRegion.duration;
  const key = phase === 'enter' ? 'reveal' : 'exitReveal';
  const unchanged: MotionFocusEdit = { kind };
  const transition = (value: string) => ({
    phase,
    type:
      value === 'none'
        ? ('none' as const)
        : clock.type === 'none'
          ? ('ease-in-out' as const)
          : clock.type,
  });
  const rememberedDuration =
    phase === 'enter' ? motionRegion.zoomInDuration : motionRegion.zoomOutDuration;
  return (
    <>
      {border ? (
        <BorderRevealFields
          phase={phase}
          value={border[key]}
          enabled={clock.type !== 'none'}
          onChange={(value) =>
            editing.commit(
              { kind: 'border', settings: value === 'none' ? {} : { [key]: value } },
              transition(value)
            )
          }
        />
      ) : spotlight ? (
        <SpotlightRevealFields
          phase={phase}
          value={spotlight[key]}
          enabled={clock.type !== 'none'}
          onChange={(value) =>
            editing.commit(
              { kind: 'spotlight', settings: value === 'none' ? {} : { [key]: value } },
              transition(value)
            )
          }
        />
      ) : null}
      {clock.type !== 'none' ? <MotionTransitionTypeField {...props} /> : null}
      <PreviewNumericRow
        label={translate('gallery.videoReview.zoomTransitionDuration')}
        value={clock.type === 'none' ? rememberedDuration : clock.duration}
        min={0}
        max={Math.min(60, Math.max(0, duration - other.duration))}
        unit="s"
        step={0.1}
        scrubStep={0.01}
        precision={2}
        disabled={clock.type === 'none'}
        onPreview={(duration) =>
          editing.preview(duration === null ? null : unchanged, {
            phase,
            duration: duration ?? rememberedDuration,
          })
        }
        onChange={(duration) => editing.commit(unchanged, { phase, duration })}
      />
    </>
  );
}
