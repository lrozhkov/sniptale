import {
  type AIModalActionBuilderProps,
  buildAIModalSelectionActions,
  buildTemplateEditorActions,
  buildTemplatePersistenceActions,
} from './action-builders';

export { buildAIModalState } from './view-state';

export function createAIModalActionHandlers(props: AIModalActionBuilderProps) {
  return {
    ...buildTemplateEditorActions(props),
    ...buildAIModalSelectionActions(props),
    ...buildTemplatePersistenceActions(props),
  };
}
