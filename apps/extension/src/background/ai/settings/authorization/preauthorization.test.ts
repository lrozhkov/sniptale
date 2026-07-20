import { expect, it } from 'vitest';

import {
  hasPreauthorizedAiSettingsMutationMessage,
  markPreauthorizedAiSettingsMutationMessage,
} from './preauthorization';

it('tracks AI settings mutation preauthorization per message object', () => {
  const authorizedMessage = {};
  const otherMessage = {};

  markPreauthorizedAiSettingsMutationMessage(authorizedMessage);

  expect(hasPreauthorizedAiSettingsMutationMessage(authorizedMessage)).toBe(true);
  expect(hasPreauthorizedAiSettingsMutationMessage(otherMessage)).toBe(false);
});
