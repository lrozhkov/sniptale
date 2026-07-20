import type {
  ScenarioEditorProjectCrudController,
  ScenarioEditorProjectHistoryController,
  ScenarioEditorProjectStateController,
  ScenarioEditorUiController,
} from '../../project/state/types';

export type ScenarioEditorToolbarController = {
  project: Pick<
    ScenarioEditorProjectStateController,
    'error' | 'project' | 'quickEditStep' | 'saveState'
  >;
  projectCrud: Pick<ScenarioEditorProjectCrudController, 'openVideoEditor' | 'renameProject'>;
  projectHistory: ScenarioEditorProjectHistoryController;
  ui: Pick<
    ScenarioEditorUiController,
    | 'leftPanelMode'
    | 'navigatorCollapsed'
    | 'setExportDialogOpen'
    | 'setLeftPanelMode'
    | 'setNavigatorCollapsed'
  >;
};
