import type { ScenarioStepHistoryState } from '../mutation/history/step/history';
import type { ScenarioEditorLeftPanelMode } from './ui';
import type { AIProviderSelectorEntry } from '../../../contracts/messaging/ai-settings-runtime';
import type { AIModel } from '../../../contracts/settings';
import type { ScenarioAiAttachmentMode } from '../ai/attachments';
import type { EditorDocument } from '../../../features/editor/document/types';
import type { ScenarioExportImageFormat } from '@sniptale/runtime-contracts/scenario/types/base';
import type { ScenarioEditorAiAttachmentDisclosure, ScenarioEditorAiRunSummary } from '../ai/types';
import type {
  ScenarioCaptureStep,
  ScenarioProject,
  ScenarioProjectSummary,
  ScenarioStep,
  ScenarioStepPatch,
} from '../../../features/scenario/contracts/types/project';

export interface ScenarioEditorInsertImagePayload {
  blob: Blob;
  filename: string;
  galleryAssetId?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
}

export interface ScenarioEditorAiController {
  attachmentMode: ScenarioAiAttachmentMode;
  activeAttachmentDisclosure: ScenarioEditorAiAttachmentDisclosure | null;
  availableModels: AIModel[];
  error: string | null;
  instruction: string;
  lastRunSummary: ScenarioEditorAiRunSummary | null;
  loading: boolean;
  providers: AIProviderSelectorEntry[];
  selectedModelId: string | null;
  setActiveAttachmentDisclosure: (disclosure: ScenarioEditorAiAttachmentDisclosure | null) => void;
  setAttachmentMode: (mode: ScenarioAiAttachmentMode) => void;
  setInstruction: (instruction: string) => void;
  setSelectedModelId: (modelId: string | null) => void;
  submitRequest: () => Promise<void>;
}

export interface ScenarioEditorUiController {
  exportDialogOpen: boolean;
  inspectedStepId: string | null;
  leftPanelMode: ScenarioEditorLeftPanelMode;
  navigatorCollapsed: boolean;
  setExportDialogOpen: (open: boolean) => void;
  setInspectedStepId: (stepId: string | null) => void;
  setLeftPanelMode: (mode: ScenarioEditorLeftPanelMode) => void;
  setNavigatorCollapsed: (collapsed: boolean) => void;
  setVisibleStepId: (stepId: string | null) => void;
  visibleStepId: string | null;
}

export interface ScenarioEditorProjectStateController {
  createName: string;
  error: string | null;
  loading: boolean;
  project: ScenarioProject | null;
  projectId: string | null;
  projects: ScenarioProjectSummary[];
  quickEditStep: ScenarioCaptureStep | null;
  quickEditStepId: string | null;
  saveState: 'error' | 'saved' | 'saving';
  selectedStep: ScenarioStep | null;
  selectedStepId: string | null;
  setCreateName: React.Dispatch<React.SetStateAction<string>>;
  setQuickEditStepId: React.Dispatch<React.SetStateAction<string | null>>;
  setSaveState: React.Dispatch<React.SetStateAction<'error' | 'saved' | 'saving'>>;
  setSelectedStepId: React.Dispatch<React.SetStateAction<string | null>>;
}

export interface ScenarioEditorProjectMutableStateController extends ScenarioEditorProjectStateController {
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setProject: React.Dispatch<React.SetStateAction<ScenarioProject | null>>;
  setProjectId: React.Dispatch<React.SetStateAction<string | null>>;
  setProjects: React.Dispatch<React.SetStateAction<ScenarioProjectSummary[]>>;
}

export interface ScenarioEditorProjectCrudController {
  createProject: () => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  exportScenario: (
    format: 'html' | 'markdown',
    mode: 'download' | 'copy',
    imageFormat: ScenarioExportImageFormat,
    includeFullImages: boolean
  ) => Promise<void>;
  openVideoEditor: () => Promise<void>;
  renameProject: (name: string) => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
}

export interface ScenarioEditorProjectHistoryController {
  canRedoProject: boolean;
  canUndoProject: boolean;
  redoProjectChange: () => void;
  trackProjectMutation: () => void;
  undoProjectChange: () => void;
}

export interface ScenarioEditorStepHistoryController {
  applyStepPatch: (stepId: string, patch: ScenarioStepPatch) => void;
  applyStepPatches: (patches: Array<{ patch: ScenarioStepPatch; stepId: string }>) => void;
  canRedoStep: (stepId: string) => boolean;
  canUndoStep: (stepId: string) => boolean;
  redoStepChange: (stepId: string) => void;
  undoStepChange: (stepId: string) => void;
}

export interface ScenarioEditorStepHistoryInternalController extends ScenarioEditorStepHistoryController {
  applyStepReplacement: (stepId: string, replaceStep: (step: ScenarioStep) => ScenarioStep) => void;
  getCurrentProject: () => ScenarioProject | null;
  stepHistoryState: ScenarioStepHistoryState;
}

export interface ScenarioEditorStepActionsController {
  acceptSuggestedEvent: (eventId: string) => void;
  applyEditedCaptureStep: (
    stepId: string,
    payload: { dataUrl: string; document: EditorDocument }
  ) => Promise<void>;
  clearTrash: () => Promise<void>;
  deleteStep: (stepId: string) => void;
  dismissSuggestedEvent: (eventId: string) => void;
  duplicateStep: (stepId: string) => Promise<void>;
  insertImageStep: (index: number, payload: ScenarioEditorInsertImagePayload) => Promise<void>;
  insertStep: (index: number, kind: 'section' | 'note' | 'divider') => void;
  moveStepByOffset: (stepId: string, offset: number) => void;
  moveStepToPosition: (stepId: string, position: number) => void;
  restoreStep: (stepId: string) => void;
  updateStep: (stepId: string, patch: ScenarioStepPatch) => void;
}

export interface ScenarioEditorProjectRuntimeController {
  applyLoadedProject: (
    nextProjectId: string | null,
    nextProject: ScenarioProject | null,
    options?: {
      preserveQuickEdit?: boolean;
      preferredStepId?: string | null;
    }
  ) => void;
  loadProjectById: (nextProjectId: string | null, preferredStepId?: string | null) => Promise<void>;
  syncProjectSummary: (project: ScenarioProject) => void;
  updateProject: (updater: (current: ScenarioProject) => ScenarioProject) => void;
}

export interface ScenarioEditorProjectStateHook {
  projectHistory: ScenarioEditorProjectHistoryController;
  runtime: ScenarioEditorProjectRuntimeController;
  state: ScenarioEditorProjectMutableStateController;
  stepHistory: ScenarioEditorStepHistoryInternalController;
}

interface ScenarioEditorProjectControllers {
  project: ScenarioEditorProjectStateController;
  projectCrud: ScenarioEditorProjectCrudController;
  projectHistory: ScenarioEditorProjectHistoryController;
}

interface ScenarioEditorStepControllers {
  stepActions: ScenarioEditorStepActionsController;
  stepHistory: ScenarioEditorStepHistoryController;
}

interface ScenarioEditorSurfaceControllers {
  ai: ScenarioEditorAiController;
  ui: ScenarioEditorUiController;
}

export interface ScenarioEditorController
  extends
    ScenarioEditorProjectControllers,
    ScenarioEditorStepControllers,
    ScenarioEditorSurfaceControllers {}
