import { expect, it } from 'vitest';

import {
  hasPreauthorizedLlmRouteMessage,
  hasPreauthorizedLlmSessionRequestMessage,
  hasPreauthorizedScenarioEditorLlmRouteMessage,
  markPreauthorizedLlmRouteMessage,
  markPreauthorizedLlmSessionRequestMessage,
  markPreauthorizedScenarioEditorLlmRouteMessage,
} from './preauthorization';

it('tracks LLM route preauthorization per message object', () => {
  const contentMessage = {};
  const scenarioMessage = {};
  const sessionMessage = {};
  const otherMessage = {};

  markPreauthorizedLlmRouteMessage(contentMessage);
  markPreauthorizedScenarioEditorLlmRouteMessage(scenarioMessage);
  markPreauthorizedLlmSessionRequestMessage(sessionMessage);

  expect(hasPreauthorizedLlmRouteMessage(contentMessage)).toBe(true);
  expect(hasPreauthorizedLlmRouteMessage(otherMessage)).toBe(false);
  expect(hasPreauthorizedScenarioEditorLlmRouteMessage(scenarioMessage)).toBe(true);
  expect(hasPreauthorizedScenarioEditorLlmRouteMessage(otherMessage)).toBe(false);
  expect(hasPreauthorizedLlmSessionRequestMessage(sessionMessage)).toBe(true);
  expect(hasPreauthorizedLlmSessionRequestMessage(otherMessage)).toBe(false);
});
