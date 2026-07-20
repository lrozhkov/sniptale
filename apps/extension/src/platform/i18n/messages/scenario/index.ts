import { defineMessageSource } from '../source';
import { scenarioCommonMessages } from './common';
import { scenarioContentMessages } from './content';
import { scenarioEditorMessages } from './editor/index';

export const scenarioMessages = defineMessageSource({
  common: scenarioCommonMessages,
  content: scenarioContentMessages,
  editor: scenarioEditorMessages,
});
