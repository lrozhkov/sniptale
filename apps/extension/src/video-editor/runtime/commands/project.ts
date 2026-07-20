import { useCallback } from 'react';
import { translate } from '../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  createBlankProject,
  deletePersistedProject,
  openPersistedProject,
} from '../../project/operations/ops';
import { toErrorMessage } from './helpers';
import type { UseVideoEditorActionHandlersParams, VideoEditorActionHandlers } from './types';
import type { VideoEditorConfirmDialogState } from '../controller/workspace-state';

const logger = createLogger({ namespace: 'VideoEditorProjects' });

async function loadProjectWorkspace(
  projectId: string,
  params: UseVideoEditorActionHandlersParams
): Promise<void> {
  const project = await openPersistedProject(projectId);
  params.applyLoadedProject(project, project.baseRecordingId);
  await Promise.all([
    params.libraries.refreshProjects(),
    params.libraries.refreshProjectExports(project.id),
  ]);
}

async function createProjectWorkspace(params: UseVideoEditorActionHandlersParams): Promise<void> {
  const project = await createBlankProject();
  params.applyLoadedProject(project, null);
  await Promise.all([
    params.libraries.refreshProjects(),
    params.libraries.refreshProjectExports(project.id),
  ]);
}

export async function deleteProjectWorkspace(
  projectId: string,
  params: UseVideoEditorActionHandlersParams,
  requestConfirm: (dialog: VideoEditorConfirmDialogState) => Promise<boolean>
): Promise<void> {
  const targetProject = params.projects.find((item) => item.id === projectId);
  const confirmed = await requestConfirm({
    title: translate('common.actions.delete'),
    message: [
      translate('common.actions.delete'),
      translate('videoEditor.app.deleteProjectPromptMiddle'),
      `"${targetProject?.name ?? projectId}"?`,
    ].join(' '),
    confirmText: translate('common.actions.delete'),
    cancelText: translate('common.actions.cancel'),
  });

  if (!confirmed) {
    return;
  }

  const remainingProjects = await deletePersistedProject(projectId);
  if (params.project?.id !== projectId) {
    await params.libraries.refreshProjects();
    return;
  }

  if (remainingProjects.length > 0) {
    const [nextProject] = remainingProjects;
    if (nextProject) {
      await loadProjectWorkspace(nextProject.id, params);
      return;
    }

    return;
  }

  await createProjectWorkspace(params);
}

export function useProjectHandlers(
  params: UseVideoEditorActionHandlersParams,
  confirmHandlers: {
    requestConfirm: (dialog: VideoEditorConfirmDialogState) => Promise<boolean>;
  }
): Pick<
  VideoEditorActionHandlers,
  'handleOpenProject' | 'handleCreateProject' | 'handleDeleteProject'
> {
  const handleOpenProject = useCallback(
    async (projectId: string) => {
      try {
        await loadProjectWorkspace(projectId, params);
      } catch (projectError) {
        logger.error('Failed to open project', projectError);
        params.setError(toErrorMessage(projectError));
      }
    },
    [params]
  );

  const handleCreateProject = useCallback(async () => {
    try {
      await createProjectWorkspace(params);
    } catch (projectError) {
      logger.error('Failed to create project', projectError);
      params.setError(toErrorMessage(projectError));
    }
  }, [params]);

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      try {
        await deleteProjectWorkspace(projectId, params, confirmHandlers.requestConfirm);
      } catch (projectError) {
        logger.error('Failed to delete project', projectError);
        params.setError(toErrorMessage(projectError));
      }
    },
    [confirmHandlers, params]
  );

  return {
    handleOpenProject,
    handleCreateProject,
    handleDeleteProject,
  };
}
