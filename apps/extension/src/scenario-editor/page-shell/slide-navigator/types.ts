import type {
  ScenarioEditorAiController,
  ScenarioEditorProjectCrudController,
  ScenarioEditorProjectStateController,
  ScenarioEditorStepActionsController,
  ScenarioEditorUiController,
} from '../../project/state/types';

export type ScenarioSlideNavigatorController = {
  ai: ScenarioEditorAiController;
  project: Pick<
    ScenarioEditorProjectStateController,
    | 'createName'
    | 'project'
    | 'projectId'
    | 'projects'
    | 'selectedStepId'
    | 'setCreateName'
    | 'setQuickEditStepId'
    | 'setSelectedStepId'
  >;
  projectCrud: Pick<
    ScenarioEditorProjectCrudController,
    'createProject' | 'deleteProject' | 'renameProject' | 'selectProject'
  >;
  stepActions: Pick<
    ScenarioEditorStepActionsController,
    'clearTrash' | 'deleteStep' | 'moveStepToPosition' | 'restoreStep'
  >;
  ui: Pick<
    ScenarioEditorUiController,
    | 'inspectedStepId'
    | 'leftPanelMode'
    | 'navigatorCollapsed'
    | 'setInspectedStepId'
    | 'setNavigatorCollapsed'
  >;
};

export type ScenarioNavigatorStepController = Pick<
  ScenarioSlideNavigatorController,
  'project' | 'stepActions' | 'ui'
>;

export type ScenarioProjectsViewController = {
  project: Pick<
    ScenarioSlideNavigatorController['project'],
    'createName' | 'projectId' | 'projects' | 'setCreateName'
  >;
  projectCrud: ScenarioSlideNavigatorController['projectCrud'];
};

export type ScenarioAiEditorController = {
  ai: ScenarioSlideNavigatorController['ai'];
  project: Pick<
    ScenarioSlideNavigatorController['project'],
    'project' | 'selectedStepId' | 'setSelectedStepId'
  >;
  ui: Pick<ScenarioSlideNavigatorController['ui'], 'setNavigatorCollapsed'>;
};
