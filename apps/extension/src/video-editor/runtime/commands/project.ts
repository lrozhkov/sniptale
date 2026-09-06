import { useCallback, useMemo } from 'react';
import { translate } from '../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  createBlankProject,
  deletePersistedProject,
  openPersistedProject,
} from '../../project/operations/ops';
import { toErrorMessage } from './helpers';
import type { ProjectHandlerPort, VideoEditorActionHandlers } from './types';
import type { VideoEditorConfirmDialogState } from '../controller/workspace-state';
import { waitForVideoEditorSave } from '../session/save-readiness';
import { beginProjectTransition } from './project-transition';

const logger = createLogger({ namespace: 'VideoEditorProjects' });

export async function loadProjectWorkspace(
  projectId: string,
  port: ProjectHandlerPort
): Promise<void> {
  const transition = beginProjectTransition();
  try {
    const currentProject = port.getCurrentProject();
    if (currentProject && currentProject.id !== projectId) {
      await waitForVideoEditorSave(currentProject.id);
      if (!transition.isCurrent()) return;
    }
    const project = await openPersistedProject(projectId);
    if (!transition.isCurrent()) return;
    port.applyLoadedProject(project, project.baseRecordingId);
    await Promise.all([
      port.libraries.refreshProjects(),
      port.libraries.refreshProjectExports(project.id),
    ]);
  } finally {
    transition.complete();
  }
}

async function createProjectWorkspace(port: ProjectHandlerPort): Promise<void> {
  const transition = beginProjectTransition();
  try {
    const currentProject = port.getCurrentProject();
    if (currentProject) {
      await waitForVideoEditorSave(currentProject.id);
      if (!transition.isCurrent()) return;
    }
    const project = await createBlankProject();
    if (!transition.isCurrent()) return;
    port.applyLoadedProject(project, null);
    await Promise.all([
      port.libraries.refreshProjects(),
      port.libraries.refreshProjectExports(project.id),
    ]);
  } finally {
    transition.complete();
  }
}

export async function deleteProjectWorkspace(
  projectId: string,
  port: ProjectHandlerPort,
  requestConfirm: (dialog: VideoEditorConfirmDialogState) => Promise<boolean>
): Promise<void> {
  const targetProject = port.projects.find((item) => item.id === projectId);
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
  if (port.getCurrentProject()?.id !== projectId) {
    await port.libraries.refreshProjects();
    return;
  }

  if (remainingProjects.length > 0) {
    const [nextProject] = remainingProjects;
    if (nextProject) {
      await loadProjectWorkspace(nextProject.id, port);
      return;
    }

    return;
  }

  await createProjectWorkspace(port);
}

export function useProjectHandlers(
  port: ProjectHandlerPort,
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
        await loadProjectWorkspace(projectId, port);
      } catch (projectError) {
        logger.error('Failed to open project', projectError);
        port.setError(toErrorMessage(projectError, 'videoEditor.app.openFailed'));
        throw projectError;
      }
    },
    [port]
  );

  const handleCreateProject = useCallback(async () => {
    try {
      await createProjectWorkspace(port);
    } catch (projectError) {
      logger.error('Failed to create project', projectError);
      port.setError(toErrorMessage(projectError, 'common.errors.actionFailed'));
    }
  }, [port]);

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      try {
        await deleteProjectWorkspace(projectId, port, confirmHandlers.requestConfirm);
      } catch (projectError) {
        logger.error('Failed to delete project', projectError);
        port.setError(toErrorMessage(projectError, 'common.errors.actionFailed'));
      }
    },
    [confirmHandlers, port]
  );

  return useMemo(
    () => ({ handleOpenProject, handleCreateProject, handleDeleteProject }),
    [handleCreateProject, handleDeleteProject, handleOpenProject]
  );
}
