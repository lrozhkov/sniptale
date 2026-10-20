import { useEffect } from 'react';
import type { VideoProjectMotionRegion } from '../../../../../features/video/project/types';
import { getMotionBindingCandidates } from '../../../../../features/video/project/motion/source-binding';
import { motionTransitionSettings } from '../../../../../features/video/project/motion/timing';
import type { MotionTransitionPhaseEdit } from '../../../../../features/video/project/motion/transitions';
import type { MotionBorderEdit } from '../../../../../features/video/project/motion';
import {
  BorderAppearanceFields,
  BorderHoldFields,
  BorderRevealFields,
} from '../../../../../ui/focus-appearance/border';
import { SegmentedRow } from '../../../../../ui/compact-inspector-controls';
import { PreviewNumericRow } from '../../../../../ui/compact-inspector-controls/numeric-preview';
import { translate } from '../../../../../platform/i18n';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { InspectorDetails } from '../shared/details';
import { MotionTransitionTypeField } from './fields';

type BorderProps = {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
};

/** One snapshot owns border gestures; commands merge against accepted authoring. */
function useBorderEditing({ motionRegion, panel }: BorderProps) {
  const project = panel.typingProject ?? panel.project;
  const preview = panel.onPreviewMotion;
  useEffect(() => () => preview?.(null), [preview, project, motionRegion.id]);
  return {
    preview: (edit: MotionBorderEdit | null, transition?: MotionTransitionPhaseEdit) =>
      preview?.(
        edit
          ? {
              kind: 'border',
              project,
              regionId: motionRegion.id,
              edit,
              ...(transition ? { transition } : {}),
            }
          : null
      ),
    commit: (edit: MotionBorderEdit, transition?: MotionTransitionPhaseEdit) => {
      preview?.(null);
      panel.onUpdateMotionRegion(motionRegion.id, {
        borderEdit: edit,
        ...(transition ? { motionTransitionPhase: transition } : {}),
      });
    },
  };
}

export function MotionEffectModeField({ motionRegion, panel }: BorderProps) {
  return (
    <SegmentedRow
      columns={2}
      layout="stacked"
      label={translate('gallery.videoReview.focusType')}
      ariaLabel={translate('gallery.videoReview.focusType')}
      value={motionRegion.border ? 'border' : 'camera'}
      options={[
        { value: 'camera', label: translate('gallery.videoReview.zoomRegionLabel') },
        { value: 'border', label: translate('gallery.videoReview.focusBorder') },
      ]}
      onChange={(mode) =>
        panel.onUpdateMotionRegion(motionRegion.id, { borderEdit: { enabled: mode === 'border' } })
      }
    />
  );
}

export function MotionBorderFields(props: BorderProps) {
  const editing = useBorderEditing(props);
  const { motionRegion, panel } = props;
  const border = motionRegion.border;
  if (!border) return null;
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
    <div className="sniptale-parameter-stack" data-ui="video-editor.motion.border">
      <SegmentedRow
        layout="stacked"
        label={translate('videoEditor.sidebar.borderTarget')}
        ariaLabel={translate('videoEditor.sidebar.borderTarget')}
        value={motionRegion.borderTarget === 'window' ? motionRegion.sourceBinding!.clipId : ''}
        options={[
          { value: '', label: translate('videoEditor.sidebar.borderTargetViewport') },
          ...targetOptions,
        ]}
        onChange={(value) => {
          panel.onPreviewMotion?.(null);
          panel.onUpdateMotionRegion(
            motionRegion.id,
            value === ''
              ? { borderEdit: { target: 'viewport' } }
              : { sourceClipId: value, borderEdit: { target: 'window' } }
          );
        }}
      />
      <BorderAppearanceFields
        value={border}
        Details={InspectorDetails}
        preferenceId="motion:border:area"
        onChange={(settings) => editing.commit({ settings })}
        onPreview={(settings) => editing.preview(settings ? { settings } : null)}
      />
    </div>
  );
}

const PHASE_LABELS = {
  enter: 'gallery.videoReview.zoomTransitionIn',
  hold: 'gallery.videoReview.borderHold',
  exit: 'gallery.videoReview.zoomTransitionOut',
} as const;

/** Native phases retain their source clock, duration budget and easing commands. */
export function MotionBorderAnimationFields(props: BorderProps) {
  const editing = useBorderEditing(props);
  const border = props.motionRegion.border;
  if (!border) return null;
  return (
    <div className="sniptale-parameter-stack" data-ui="video-editor.motion.border-animation">
      {(['enter', 'hold', 'exit'] as const).map((phase) => {
        const label = translate(PHASE_LABELS[phase]);
        return (
          <InspectorDetails
            key={phase}
            preferenceId={`motion:border:${phase}`}
            label={label}
            initiallyOpen
          >
            <fieldset className="min-w-0 sniptale-parameter-stack" aria-label={label}>
              {phase === 'hold' ? (
                <BorderHoldFields
                  border={border}
                  onChange={(settings) => editing.commit({ settings })}
                  onPreview={(settings) => editing.preview(settings ? { settings } : null)}
                />
              ) : (
                <MotionBorderPhaseFields {...props} phase={phase} editing={editing} />
              )}
            </fieldset>
          </InspectorDetails>
        );
      })}
    </div>
  );
}

function MotionBorderPhaseFields(
  props: BorderProps & { phase: 'enter' | 'exit'; editing: ReturnType<typeof useBorderEditing> }
) {
  const { motionRegion, phase, editing } = props;
  const border = motionRegion.border!;
  const clock = motionTransitionSettings(motionRegion, phase);
  const other = motionTransitionSettings(motionRegion, phase === 'enter' ? 'exit' : 'enter');
  const duration =
    motionRegion.animation?.duration ??
    motionRegion.sourceBinding?.animation.duration ??
    motionRegion.duration;
  const key = phase === 'enter' ? 'reveal' : 'exitReveal';
  const reveal = border[key];
  return (
    <>
      <BorderRevealFields
        phase={phase}
        value={reveal}
        enabled={clock.type !== 'none'}
        onChange={(value) => {
          const type =
            value === 'none' ? 'none' : clock.type === 'none' ? 'ease-in-out' : clock.type;
          editing.commit({ settings: value === 'none' ? {} : { [key]: value } }, { phase, type });
        }}
      />
      {clock.type !== 'none' ? <MotionTransitionTypeField {...props} phase={phase} /> : null}
      <PreviewNumericRow
        label={translate('gallery.videoReview.zoomTransitionDuration')}
        value={clock.duration}
        min={0}
        max={Math.min(60, Math.max(0, duration - other.duration))}
        unit="s"
        step={0.1}
        scrubStep={0.01}
        precision={2}
        disabled={clock.type === 'none'}
        onPreview={(duration) =>
          editing.preview(duration === null ? null : {}, {
            phase,
            duration: duration ?? clock.duration,
          })
        }
        onChange={(duration) => editing.commit({}, { phase, duration })}
      />
    </>
  );
}
