import { defineMessageSource } from '../../source';
import { scenarioEditorAiMessages } from './ai';
import { scenarioEditorCoreMessages } from './core';
import { scenarioEditorExportMessages } from './export';
import { scenarioEditorImageStepMessages } from './image-step';
import { scenarioEditorQuickEditMessages } from './quick-edit';
import { scenarioEditorV3ElementMessages } from './v3-elements';
import { scenarioEditorV3LayerMessages } from './v3-layers';
import { scenarioEditorV3Messages } from './v3';
import { scenarioEditorV3PresentationMessages } from './v3-presentation';
import { scenarioEditorV3TemplateMessages } from './v3-templates';

export const scenarioEditorMessages = defineMessageSource({
  ...scenarioEditorAiMessages,
  ...scenarioEditorCoreMessages,
  ...scenarioEditorExportMessages,
  ...scenarioEditorImageStepMessages,
  ...scenarioEditorQuickEditMessages,
  ...scenarioEditorV3ElementMessages,
  ...scenarioEditorV3LayerMessages,
  ...scenarioEditorV3Messages,
  ...scenarioEditorV3PresentationMessages,
  ...scenarioEditorV3TemplateMessages,
});
