import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import type { VideoProject } from '../../../features/video/project/types';
import {
  applyVideoProjectHistoryChangeValues,
  type VideoProjectHistoryChange,
} from '../../../features/video/project/history-change';

export {
  createVideoProjectHistoryChange,
  type VideoProjectHistoryChange,
} from '../../../features/video/project/history-change';

/** Runtime history keeps the canonical mutation timestamp and schema owner. */
export function applyVideoProjectHistoryChange(
  current: VideoProject,
  change: VideoProjectHistoryChange
): VideoProject {
  return applyVideoProjectMutationPatch(applyVideoProjectHistoryChangeValues(current, change), {});
}
