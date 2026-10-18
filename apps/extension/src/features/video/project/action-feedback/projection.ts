import type { VideoProject } from '../types';
import type {
  VideoProjectActionFeedback,
  ReviewActionAudioSetting,
  ReviewClickAnimation,
} from './types';
import { parseVideoProjectActionFeedback } from './validation';
import { isVideoProjectUtilityLaneLocked } from '../utility-lanes';

/** Functional authored-content update through the existing document history owner. */
export function patchVideoProjectActionFeedback(
  project: VideoProject,
  identity: Pick<VideoProjectActionFeedback, 'recordingId' | 'sourceInstanceId'>,
  patch: { settings?: ReviewActionAudioSetting[]; gestureStyles?: ReviewClickAnimation[] }
): VideoProject {
  if (isVideoProjectUtilityLaneLocked(project, 'actions')) return project;
  if (
    !project.actionFeedback?.some(
      (group) =>
        group.recordingId === identity.recordingId &&
        group.sourceInstanceId === identity.sourceInstanceId
    )
  )
    return project;
  const values = (project.actionFeedback ?? []).map((group) =>
    group.recordingId === identity.recordingId &&
    group.sourceInstanceId === identity.sourceInstanceId
      ? { ...group, ...patch }
      : group
  );
  const parsed = parseVideoProjectActionFeedback(values);
  return parsed
    ? { ...project, version: project.version >= 4 ? project.version : 3, actionFeedback: parsed }
    : project;
}
