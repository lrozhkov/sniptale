import { expect, it } from 'vitest';

import {
  hasPolicyStateDescriptor,
  policyStateRegistry as applicationPolicyStateRegistry,
} from './index';
import { policyStateRegistry } from '../../routing-contracts/policy-state';

it('keeps the application policy-state facade thin and aligned', () => {
  expect(applicationPolicyStateRegistry).toBe(policyStateRegistry);
  expect(hasPolicyStateDescriptor('llm-session-tokens')).toBe(true);
});
