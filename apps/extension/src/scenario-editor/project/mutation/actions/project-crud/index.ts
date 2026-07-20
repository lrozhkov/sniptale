import { translate } from '../../../../../platform/i18n';
import { commitVideoProjectMutation } from '../../../../../composition/persistence/projects/index-mutations';
import { deleteVideoProject } from '../../../../../composition/persistence/projects/index';
import { openVideoEditorPage } from '../../../../../platform/navigation/extension-pages';
import { buildScenarioHtmlExport } from '../../../export/html';
import { buildScenarioMarkdownExport } from '../../../export/markdown';
import { buildVideoProjectDraftFromScenarioProject } from '../../../../../workflows/scenario-video/draft';
import {
  createScenarioProjectRecord,
  deleteScenarioProjectRecord,
  getScenarioAssetEntry,
  getScenarioAssetBlob,
  renameScenarioProjectRecord,
  saveScenarioExportRecord,
} from '../../../../../composition/persistence/scenario/store/public';
import type { ScenarioExportImageFormat } from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioCaptureStep,
  ScenarioProject,
  ScenarioProjectSummary,
} from '../../../../../features/scenario/contracts/types/project';
import type { ScenarioVideoBridgeAsset } from '../../../../../workflows/scenario-video/types';
import type { ScenarioEditorBrowserDriverPort } from '../../../../application/ports/browser-driver';
import type { ScenarioEditorLeftPanelMode } from '../../../state/ui';

type ApplyLoadedProject = (
  nextProjectId: string | null,
  nextProject: ScenarioProject | null,
  options?: {
    preserveQuickEdit?: boolean;
    preferredStepId?: string | null;
  }
) => void;

export function createScenarioEditorProjectCrud(args: {
  applyLoadedProject: ApplyLoadedProject;
  browserDriver: Pick<ScenarioEditorBrowserDriverPort, 'downloadBlob'>;
  createName: string;
  loadProjectById: (nextProjectId: string | null, preferredStepId?: string | null) => Promise<void>;
  project: ScenarioProject | null;
  projectId: string | null;
  projects: ScenarioProjectSummary[];
  quickEditStepId: string | null;
  selectedStepId: string | null;
  setCreateName: (name: string) => void;
  setError: (error: string | null) => void;
  setLeftPanelMode: (mode: ScenarioEditorLeftPanelMode) => void;
  setProjects: React.Dispatch<React.SetStateAction<ScenarioProjectSummary[]>>;
  syncProjectSummary: (project: ScenarioProject) => void;
}) {
  return {
    createProject: createProjectAction(args),
    selectProject: selectProjectAction(args),
    renameProject: renameProjectAction(args),
    deleteProject: deleteProjectAction(args),
    exportScenario: exportScenarioAction(args),
    openVideoEditor: openVideoEditorAction(args),
  };
}

function getScenarioCaptureSteps(project: ScenarioProject): ScenarioCaptureStep[] {
  return project.steps.filter((step): step is ScenarioCaptureStep => step.kind === 'capture');
}

function resolveScenarioVideoAssetName(
  step: ScenarioCaptureStep | undefined,
  assetId: string
): string {
  return step?.title.trim() || step?.body.trim() || assetId;
}

async function buildScenarioVideoAssets(
  project: ScenarioProject
): Promise<Record<string, ScenarioVideoBridgeAsset>> {
  const firstCaptureStepByAssetId = new Map<string, ScenarioCaptureStep>();

  for (const step of getScenarioCaptureSteps(project)) {
    if (!firstCaptureStepByAssetId.has(step.assetId)) {
      firstCaptureStepByAssetId.set(step.assetId, step);
    }
  }

  const assets: Record<string, ScenarioVideoBridgeAsset> = {};

  await Promise.all(
    [...firstCaptureStepByAssetId.entries()].map(async ([assetId, step]) => {
      const entry = await getScenarioAssetEntry(assetId);
      if (!entry) {
        return;
      }

      assets[assetId] = {
        createdAt: entry.createdAt,
        height: entry.height,
        mimeType: entry.mimeType,
        name: resolveScenarioVideoAssetName(step, assetId),
        size: entry.size,
        width: entry.width,
      };
    })
  );

  return assets;
}

function createProjectAction(args: Parameters<typeof createScenarioEditorProjectCrud>[0]) {
  return async (): Promise<void> => {
    const name = args.createName.trim() || translate('scenario.common.defaultProjectName');
    const nextProject = await createScenarioProjectRecord(name);
    args.setError(null);
    args.setCreateName('');
    args.syncProjectSummary(nextProject);
    args.applyLoadedProject(nextProject.id, nextProject);
    args.setLeftPanelMode('navigator');
  };
}

function selectProjectAction(args: Parameters<typeof createScenarioEditorProjectCrud>[0]) {
  return async (nextProjectId: string): Promise<void> => {
    if (nextProjectId === args.projectId) {
      args.setLeftPanelMode('navigator');
      return;
    }

    args.setError(null);
    await args.loadProjectById(nextProjectId);
    args.setLeftPanelMode('navigator');
  };
}

function renameProjectAction(args: Parameters<typeof createScenarioEditorProjectCrud>[0]) {
  return async (name: string): Promise<void> => {
    if (!args.projectId) {
      return;
    }

    const nextName = name.trim() || translate('scenario.common.defaultProjectName');
    const updatedProject = await renameScenarioProjectRecord(args.projectId, nextName);
    if (!updatedProject) {
      return;
    }

    args.syncProjectSummary(updatedProject);
    args.applyLoadedProject(updatedProject.id, updatedProject, {
      preferredStepId: args.selectedStepId,
      preserveQuickEdit: Boolean(args.quickEditStepId),
    });
  };
}

function deleteProjectAction(args: Parameters<typeof createScenarioEditorProjectCrud>[0]) {
  return async (targetProjectId: string): Promise<void> => {
    await deleteScenarioProjectRecord(targetProjectId);
    args.setProjects((current) => current.filter((item) => item.id !== targetProjectId));
    if (args.projectId !== targetProjectId) {
      return;
    }

    const nextProjectId = args.projects.find((item) => item.id !== targetProjectId)?.id ?? null;
    await args.loadProjectById(nextProjectId);
  };
}

function exportScenarioAction(args: Parameters<typeof createScenarioEditorProjectCrud>[0]) {
  return async (
    format: 'html' | 'markdown',
    mode: 'download' | 'copy',
    imageFormat: ScenarioExportImageFormat,
    includeFullImages = false
  ) => {
    if (!args.project) {
      return;
    }

    const exportResult =
      format === 'html'
        ? await buildScenarioHtmlExport(
            args.project,
            getScenarioAssetBlob,
            imageFormat,
            includeFullImages
          )
        : await buildScenarioMarkdownExport(args.project, getScenarioAssetBlob, imageFormat);
    if (mode === 'copy' && format === 'html') {
      await navigator.clipboard.writeText(await exportResult.blob.text());
    } else {
      args.browserDriver.downloadBlob(exportResult.blob, exportResult.filename);
    }

    await saveScenarioExportRecord({
      projectId: args.project.id,
      format: exportResult.format,
      filename: exportResult.filename,
      size: exportResult.blob.size,
    });
  };
}

function openVideoEditorAction(args: Parameters<typeof createScenarioEditorProjectCrud>[0]) {
  return async (): Promise<void> => {
    if (!args.project) {
      return;
    }

    args.setError(null);
    let nextProjectId: string | null = null;

    try {
      const assets = await buildScenarioVideoAssets(args.project);
      const nextProject = buildVideoProjectDraftFromScenarioProject({
        assets,
        project: args.project,
      });

      await commitVideoProjectMutation(nextProject, { baseRevision: null });
      nextProjectId = nextProject.id;
      await openVideoEditorPage(nextProject.id, nextProject.baseRecordingId);
    } catch {
      if (nextProjectId) {
        await deleteVideoProject(nextProjectId).catch(() => undefined);
      }
      args.setError(translate('scenario.editor.videoProjectCreateFailed'));
    }
  };
}
