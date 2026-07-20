import { expect, it } from 'vitest';

import { applyScenarioEditorAIResponse } from './response/apply';
import { applyScenarioEditorAIResponse as applyScenarioEditorAIResponseImpl } from './response/apply';

it('keeps the response facade thin', () => {
  expect(applyScenarioEditorAIResponse).toBe(applyScenarioEditorAIResponseImpl);
});
