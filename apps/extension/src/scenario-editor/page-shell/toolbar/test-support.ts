import { vi } from 'vitest';
import type { ScenarioEditorToolbarController } from './types';

function createProjectRecord() {
  return {
    createdAt: 10,
    id: 'project-1',
    name: 'Project 1',
    steps: [],
    suggestedEvents: [],
    trash: [],
    updatedAt: 20,
    version: 2 as const,
  };
}

export function createScenarioEditorToolbarController(
  overrides: Partial<ScenarioEditorToolbarController> = {}
): ScenarioEditorToolbarController {
  return {
    project: {
      error: null,
      project: createProjectRecord(),
      quickEditStep: null,
      saveState: 'saved',
    },
    projectCrud: {
      openVideoEditor: vi.fn(),
      renameProject: vi.fn(),
    },
    projectHistory: {
      canRedoProject: false,
      canUndoProject: false,
      redoProjectChange: vi.fn(),
      trackProjectMutation: vi.fn(),
      undoProjectChange: vi.fn(),
    },
    ui: {
      leftPanelMode: 'navigator',
      navigatorCollapsed: false,
      setExportDialogOpen: vi.fn(),
      setLeftPanelMode: vi.fn(),
      setNavigatorCollapsed: vi.fn(),
    },
    ...overrides,
  };
}
