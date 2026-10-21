import { useLayoutEffect, useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import {
  createVideoProjectSceneEdges,
  parseVideoProjectSceneEdges,
  resolveVideoProjectSceneEdgePlan,
  type PresentationFade,
  type VideoProjectSceneEdges,
} from '../../../../../features/video/project/scene/edge-fades';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import { translate } from '../../../../../platform/i18n';
import { SegmentedRow } from '../../../../../ui/compact-inspector-controls';
import { PresentationFadeFields } from '../../../../../ui/presentation-fade-fields';
import type { VideoEditorSceneEdgesInspectorRuntime } from '../../../../contracts/workspace';
import {
  useVideoEditorHistoryPort,
  useVideoEditorTimelineEditingPort,
} from '../../../../runtime/controller/store';
import { SceneJoinFields } from './scene-joins';
import { SceneBookendFields } from './scene-bookends';
import { InspectorDetails } from '../shared/details';

/** Scalar authoring and disposable gestures reuse the existing Native authorities. */
export function SceneEdgesFields(props: {
  project: VideoProject;
  runtime: VideoEditorSceneEdgesInspectorRuntime;
}) {
  const editor = useSceneEdgeEditing(props.project, props.runtime.onPreview);
  const { settings, refused, commit } = editor;
  const plan = resolveVideoProjectSceneEdgePlan({ ...props.project, sceneEdges: settings });
  return (
    <div className="min-w-0 space-y-3" data-ui="video-editor.scene-edges.inspector">
      {(['intro', 'outro'] as const).map((side) => {
        const heading = translate(
          side === 'intro'
            ? 'gallery.videoReview.presentationIntro'
            : 'gallery.videoReview.presentationOutro'
        );
        return (
          <InspectorDetails
            key={side}
            label={heading}
            preferenceId={`scene-edges.${side}`}
            initiallyOpen
            icon={side === 'intro' ? LogIn : LogOut}
          >
            <SegmentedRow
              ariaLabel={heading}
              columns={2}
              value={settings[side].enabled ? 'fade' : 'none'}
              options={[
                { value: 'none', label: translate('gallery.videoReview.presentationNoEffect') },
                {
                  value: 'fade',
                  label: translate(
                    side === 'intro'
                      ? 'gallery.videoReview.presentationFadeIn'
                      : 'gallery.videoReview.presentationFadeOut'
                  ),
                },
              ]}
              onChange={(mode) => commit(side, { enabled: mode === 'fade' })}
            />
            {settings[side].enabled && (
              <PresentationFadeFields
                value={settings[side]}
                duration={
                  side === 'intro' ? plan.visualEnvelope.fadeIn : plan.visualEnvelope.fadeOut
                }
                fallbackColor="#000000ff"
                fallbackAudioFade={false}
                onChange={(patch) => commit(side, patch)}
                onPreview={(patch) => editor.preview(side, patch)}
              />
            )}
            <SceneBookendFields project={props.project} side={side} />
          </InspectorDetails>
        );
      })}
      <SceneJoinFields project={props.project} runtime={props.runtime} />
      {refused && (
        <p role="alert" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('common.errors.actionFailed')}
        </p>
      )}
    </div>
  );
}

function useSceneEdgeEditing(
  project: VideoProject,
  onPreview: VideoEditorSceneEdgesInspectorRuntime['onPreview']
) {
  const updateProject = useVideoEditorTimelineEditingPort((port) => port.updateProject);
  const { begin, end } = useVideoEditorHistoryPort((port) => ({
    begin: port.beginProjectHistoryTransaction,
    end: port.endProjectHistoryTransaction,
  }));
  const [refused, setRefused] = useState(false);
  useLayoutEffect(() => () => onPreview(null), [project, onPreview]);
  const settings = project.sceneEdges ?? createVideoProjectSceneEdges();
  const proposal = (side: keyof VideoProjectSceneEdges, change: Partial<PresentationFade>) =>
    parseVideoProjectSceneEdges({ ...settings, [side]: { ...settings[side], ...change } });
  const commit = (side: keyof VideoProjectSceneEdges, change: Partial<PresentationFade>) => {
    const next = proposal(side, change);
    const lease = next ? begin({ onlyIfIdle: true }) : null;
    if (!next || !lease) {
      setRefused(true);
      return;
    }
    let accepted = false;
    try {
      updateProject((current) => {
        if (current !== project) return current;
        accepted = true;
        return JSON.stringify(settings) === JSON.stringify(next)
          ? current
          : { ...current, sceneEdges: next };
      });
    } finally {
      end(lease);
      onPreview(null);
    }
    setRefused(!accepted);
  };
  const preview = (side: keyof VideoProjectSceneEdges, patch: Partial<PresentationFade> | null) => {
    const next = patch === null ? null : proposal(side, patch);
    onPreview(next ? { project, settings: next } : null);
  };
  return { settings, refused, commit, preview };
}
