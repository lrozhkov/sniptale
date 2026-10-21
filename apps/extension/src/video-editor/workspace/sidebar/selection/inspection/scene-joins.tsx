import { useLayoutEffect, useState } from 'react';
import { ArrowRightLeft, LogIn, LogOut, LocateFixed } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { CompositionJoinSettings } from '../../../../../features/video/project/scene/composition-join';
import { parseVideoProjectCompositionJoins } from '../../../../../features/video/project/scene/joins';
import type { VideoProjectCompositionJoin } from '../../../../../features/video/project/scene/joins-types';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import { formatNumber, translate, useAppLocale } from '../../../../../platform/i18n';
import { PresentationJoinFields } from '../../../../../ui/presentation-join-fields';
import type { VideoEditorSceneEdgesInspectorRuntime } from '../../../../contracts/workspace';
import {
  useVideoEditorPlaybackPort,
  useVideoEditorTimelineEditingPort,
} from '../../../../runtime/controller/store';
import { InspectorDetails } from '../shared/details';

/** Instances author exact accepted boundaries through the existing command and preview ports. */
export function SceneJoinFields(props: {
  project: VideoProject;
  runtime: VideoEditorSceneEdgesInspectorRuntime;
}) {
  const locale = useAppLocale();
  const update = useVideoEditorTimelineEditingPort((port) => port.updateCompositionJoins);
  const playback = useVideoEditorPlaybackPort((port) => ({
    seek: port.setCurrentTime,
    stop: port.setPlaying,
  }));
  const [refused, setRefused] = useState(false);
  const onPreview = props.runtime.onPreview;
  useLayoutEffect(() => () => onPreview(null), [props.project, onPreview]);
  const boundaries = props.project.compositionJoins ?? [];
  if (boundaries.length === 0) return null;
  const propose = (
    boundary: VideoProjectCompositionJoin,
    value: CompositionJoinSettings | null
  ) => {
    const { transition: _previous, ...rest } = boundary;
    return parseVideoProjectCompositionJoins(
      boundaries.map((item) =>
        item.id === boundary.id ? { ...rest, ...(value ? { transition: value } : {}) } : item
      )
    );
  };
  return (
    <InspectorDetails
      label={translate('videoEditor.sidebar.compositionJoins')}
      preferenceId="scene.compositionJoins"
      icon={ArrowRightLeft}
      initiallyOpen
    >
      {[...boundaries]
        .sort((a, b) => seam(a) - seam(b))
        .map((boundary) => {
          const clip = props.project.clips.find((item) => item.id === boundary.clipId);
          if (!clip || (clip.type !== 'VIDEO' && clip.type !== 'IMAGE')) return null;
          const asset = props.project.assets.find((item) => item.id === clip.assetId);
          return (
            <InspectorDetails
              key={boundary.id}
              level="group"
              label={asset?.name ?? translate('videoEditor.sidebar.originalAudioMissingSource')}
              icon={boundary.edge === 'end' ? LogIn : LogOut}
              preferenceId={`scene.compositionJoins.${boundary.id}`}
              initiallyOpen
            >
              <ContentToolbarButton
                type="button"
                size="compact"
                tone="utility"
                className="flex max-w-full items-center gap-1.5 tabular-nums"
                aria-label={translate('videoEditor.sidebar.compositionJoinSeek')}
                title={translate('videoEditor.sidebar.compositionJoinSeek')}
                onClick={() => {
                  playback.stop(false);
                  playback.seek(seam(boundary));
                }}
              >
                <LocateFixed size={14} aria-hidden="true" />
                {formatNumber(seam(boundary), { maximumFractionDigits: 3 }, locale)}
                <span>{translate('videoEditor.sidebar.typingSeconds')}</span>
              </ContentToolbarButton>
              <PresentationJoinFields
                label={translate('videoEditor.sidebar.compositionJoin')}
                value={boundary.transition}
                Details={InspectorDetails}
                preferenceId={`scene.compositionJoins.${boundary.id}`}
                onChange={(value) => {
                  const proposal = propose(boundary, value);
                  const result = proposal ? update(proposal, props.project) : null;
                  setRefused(!result || result.status === 'rejected');
                  onPreview(null);
                }}
                onPreview={(value) => {
                  const proposal = value ? propose(boundary, value) : null;
                  onPreview(
                    proposal ? { project: props.project, compositionJoins: proposal } : null
                  );
                }}
              />
            </InspectorDetails>
          );
        })}
      {refused && (
        <p role="alert" className="text-xs">
          {translate('common.errors.actionFailed')}
        </p>
      )}
    </InspectorDetails>
  );
  function seam(boundary: VideoProjectCompositionJoin) {
    const clip = props.project.clips.find((item) => item.id === boundary.clipId);
    return clip ? clip.startTime + (boundary.edge === 'end' ? clip.duration : 0) : 0;
  }
}
