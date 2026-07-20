import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import { applyTimelinePlacementPolicy } from '../../../../features/video/project/timeline';
import {
  VideoProjectClipType,
  type VideoProject,
  type VideoProjectEffectClip,
} from '../../../../features/video/project/types';
import { translate } from '../../../../platform/i18n';

interface EffectHostMutationResult {
  effectInstanceId: string;
  hostClipId: string;
  project: VideoProject;
}

export function duplicateStandaloneEffectHost(
  project: VideoProject,
  hostClipId: string
): EffectHostMutationResult | null {
  const sourceHost = findEffectHost(project, hostClipId);
  if (!sourceHost) return null;
  const sourceInstance = project.effectInstances?.find(
    ({ id, kind, target }) =>
      id === sourceHost.effectInstanceId && kind === 'standalone' && target.kind === 'scene'
  );
  if (!sourceInstance) return null;

  const instanceId = crypto.randomUUID();
  const host: VideoProjectEffectClip = {
    ...sourceHost,
    effectInstanceId: instanceId,
    groupId: null,
    id: crypto.randomUUID(),
    name: `${sourceHost.name} ${translate('shared.projectActions.copySuffix')}`,
    startTime: sourceHost.startTime + 0.25,
    transform: { ...sourceHost.transform },
  };
  const instance = {
    ...sourceInstance,
    controls: { ...sourceInstance.controls },
    id: instanceId,
    startTime: host.startTime,
  };
  const sourceInstanceIndex = (project.effectInstances ?? []).findIndex(
    ({ id }) => id === sourceInstance.id
  );
  const instances = project.effectInstances ?? [];
  const nextProject = applyTimelinePlacementPolicy(
    applyVideoProjectMutationPatch(project, {
      clips: [...project.clips, host],
      effectInstances: [
        ...instances.slice(0, sourceInstanceIndex + 1),
        instance,
        ...instances.slice(sourceInstanceIndex + 1),
      ],
    }),
    [host.id]
  );
  return { effectInstanceId: instanceId, hostClipId: host.id, project: nextProject };
}

export function splitStandaloneEffectHost(
  project: VideoProject,
  hostClipId: string,
  splitTime: number
): VideoProject | null {
  const sourceHost = findEffectHost(project, hostClipId);
  if (!sourceHost) return null;
  const sourceInstance = project.effectInstances?.find(
    ({ id, kind, target }) =>
      id === sourceHost.effectInstanceId && kind === 'standalone' && target.kind === 'scene'
  );
  if (!sourceInstance) return null;
  const localOffset = splitTime - sourceHost.startTime;
  if (localOffset <= 0.05 || localOffset >= sourceHost.duration - 0.05) return project;

  const secondDuration = sourceHost.duration - localOffset;
  const sourcePlaybackDuration = sourceInstance.duration * sourceInstance.playbackRate;
  const instanceId = crypto.randomUUID();
  const secondHost: VideoProjectEffectClip = {
    ...sourceHost,
    duration: secondDuration,
    effectInstanceId: instanceId,
    id: crypto.randomUUID(),
    name: `${sourceHost.name} · ${translate('shared.projectActions.splitPartSuffix')} 2`,
    startTime: splitTime,
    transform: { ...sourceHost.transform },
  };
  const firstInstance = {
    ...sourceInstance,
    controls: { ...sourceInstance.controls },
    duration: localOffset,
    playbackRate: sourcePlaybackDuration / localOffset,
  };
  const secondInstance = {
    ...sourceInstance,
    controls: { ...sourceInstance.controls },
    duration: secondDuration,
    id: instanceId,
    playbackRate: sourcePlaybackDuration / secondDuration,
    startTime: splitTime,
  };
  return applyVideoProjectMutationPatch(project, {
    clips: project.clips.flatMap((clip) =>
      clip.id === sourceHost.id ? [{ ...sourceHost, duration: localOffset }, secondHost] : [clip]
    ),
    effectInstances: (project.effectInstances ?? []).flatMap((instance) =>
      instance.id === sourceInstance.id ? [firstInstance, secondInstance] : [instance]
    ),
  });
}

function findEffectHost(project: VideoProject, clipId: string): VideoProjectEffectClip | null {
  const clip = project.clips.find(({ id }) => id === clipId);
  return clip?.type === VideoProjectClipType.EFFECT ? clip : null;
}
