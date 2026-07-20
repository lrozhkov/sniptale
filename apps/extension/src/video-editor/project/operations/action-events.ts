import { isLegacyScrollActionEvent } from '../../../features/video/project/timeline/source-time';
import type { VideoProject } from '../../../features/video/project/types/model';

export function getVisibleProjectActionEvents(
  project: Pick<VideoProject, 'actionEvents'>
): VideoProject['actionEvents'] {
  return project.actionEvents.filter((event) => !isLegacyScrollActionEvent(event));
}

export function findVisibleProjectActionEvent(
  project: Pick<VideoProject, 'actionEvents'>,
  actionEventId: string
): VideoProject['actionEvents'][number] | null {
  return getVisibleProjectActionEvents(project).find((event) => event.id === actionEventId) ?? null;
}

export function hasVisibleProjectActionEvents(
  project: Pick<VideoProject, 'actionEvents'>
): boolean {
  return getVisibleProjectActionEvents(project).length > 0;
}
