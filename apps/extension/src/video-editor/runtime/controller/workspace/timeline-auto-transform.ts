import type { VideoProject } from '../../../../features/video/project/types';
import {
  prepareAutoProcessing,
  isAutoProcessingTelemetryCurrent,
  type AutoProcessingPreview,
  type AutoProcessingActions,
} from '../../../project/operations/auto-transform';

interface TimelineAutoTransformStore {
  updateProject: (updater: (project: VideoProject) => VideoProject) => void;
}
export function createAutoProcessingActions(
  store: TimelineAutoTransformStore,
  getProjectSnapshot: () => VideoProject | null
): AutoProcessingActions {
  const isCurrent = (preview: AutoProcessingPreview) =>
    getProjectSnapshot() === preview.sourceProject;
  return {
    isCurrent,
    async prepare(request, selectedIds) {
      const project = getProjectSnapshot();
      if (!project) return { status: 'stale' };
      const preview = await prepareAutoProcessing(project, request, selectedIds);
      return getProjectSnapshot() === project ? preview : { status: 'stale' };
    },
    async apply(preview) {
      if (!isCurrent(preview)) return 'stale';
      if (preview.status !== 'ready' || !preview.project || !preview.selectedIds.length)
        return preview.status === 'blocked' ? 'blocked' : 'unchanged';
      if (!(await isAutoProcessingTelemetryCurrent(preview)) || !isCurrent(preview)) return 'stale';
      let applied = false;
      store.updateProject((current) => {
        if (current !== preview.sourceProject) return current;
        applied = true;
        return preview.project!;
      });
      return applied ? 'applied' : 'stale';
    },
  };
}
