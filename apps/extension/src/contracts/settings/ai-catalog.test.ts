import { expect, it } from 'vitest';
import {
  isAIConnectionObservation,
  isAIConnectionReason,
  isAIModelOperationObservations,
} from './ai-catalog';

const observation = { status: 'available', scope: 'catalog', checkedAt: 100, revision: 2 };
it('admits bounded observations without requiring failure or success-history fields', () => {
  expect(isAIConnectionObservation(observation)).toBe(true);
  expect(
    isAIConnectionObservation({
      ...observation,
      scope: 'operation',
      lastSuccessAt: 80,
      reason: 'rate-limited',
    })
  ).toBe(true);
  expect(
    isAIConnectionObservation({
      ...observation,
      scope: 'credentials',
      status: 'unavailable',
      reason: 'invalid-credential',
    })
  ).toBe(true);
});
it.each(['unverified', 'available', 'unavailable', 'permission-required', 'locked'])(
  'retains the existing %s observation state',
  (status) => {
    expect(isAIConnectionObservation({ ...observation, status })).toBe(true);
  }
);
it.each([
  null,
  undefined,
  [],
  { ...observation, secret: 'private' },
  { ...observation, status: 'invented' },
  { ...observation, scope: 'invented' },
  { ...observation, checkedAt: -1 },
  { ...observation, checkedAt: NaN },
  { ...observation, checkedAt: '100' },
  { ...observation, revision: -1 },
  { ...observation, revision: '2' },
  { ...observation, lastSuccessAt: -1 },
  { ...observation, reason: 'private-response' },
  { ...observation, reason: { status: 401 } },
])('refuses unknown or unbounded observation metadata: %j', (value) => {
  expect(isAIConnectionObservation(value)).toBe(false);
});
it.each([
  'invalid-credential',
  'permission-denied',
  'quota-exceeded',
  'model-unavailable',
  'rate-limited',
  'network',
  'timeout',
  'service-error',
  'unknown',
  'host-permission-required',
  'secret-locked',
  'catalog-unsupported',
  'provider-unavailable',
])('shares fixed %s reason admission between observations and IPC', (reason) => {
  expect(isAIConnectionReason(reason)).toBe(true);
  expect(isAIConnectionObservation({ ...observation, reason })).toBe(true);
});
it.each(['private-response', null, undefined, {}, 402])(
  'refuses provider content as a reason: %j',
  (value) => {
    expect(isAIConnectionReason(value)).toBe(false);
  }
);

it('admits separate bounded operation generations and observations', () => {
  expect(
    isAIModelOperationObservations({
      text: { generation: 'pending', observation: { ...observation, scope: 'operation' } },
      speech: { observation: { ...observation, scope: 'operation', reason: 'model-unavailable' } },
      transcription: { generation: 'another' },
    })
  ).toBe(true);
});
it.each([
  null,
  [],
  { image: {} },
  { text: null },
  { text: { generation: '' } },
  { text: { generation: 1 } },
  { text: { generation: 'x'.repeat(201) } },
  { text: { rawError: 'private-response' } },
  { text: { observation } },
  { text: { observation: { ...observation, scope: 'operation', secret: 'private' } } },
  { text: { observation: { ...observation, scope: 'operation', reason: 'raw-response' } } },
])('refuses invalid model operation metadata: %j', (value) => {
  expect(isAIModelOperationObservations(value)).toBe(false);
});
