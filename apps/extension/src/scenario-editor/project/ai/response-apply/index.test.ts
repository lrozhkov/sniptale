import { expect, it } from 'vitest';

import { applyScenarioEditorAIResponse as applyScenarioEditorAIResponseImpl } from './response/apply';
import { applyScenarioEditorAIResponse } from './';

it('keeps the top-level apply contract re-export intact', () => {
  expect(applyScenarioEditorAIResponse).toBe(applyScenarioEditorAIResponseImpl);
});
