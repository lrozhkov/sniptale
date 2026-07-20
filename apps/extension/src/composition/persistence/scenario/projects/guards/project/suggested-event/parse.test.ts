import { expect, it } from 'vitest';
import { type ScenarioSuggestedEventKind } from '@sniptale/runtime-contracts/scenario/types/base';
import { type ScenarioTargetDescriptor } from '@sniptale/runtime-contracts/scenario/types/geometry';
import { parseSuggestedEvent } from './parse/run';

type SuggestedEventTestDataRecord = Record<string, string | number | boolean | null>;

function createNullablePredicate<T>(predicate: (value: unknown) => value is T) {
  return (value: unknown): value is T | null => value === null || predicate(value);
}

function isScenarioTargetDescriptorStub(value: unknown): value is ScenarioTargetDescriptor {
  return value === null
    ? false
    : typeof value === 'object' &&
        value !== null &&
        typeof (value as Record<string, unknown>)['kind'] === 'string' &&
        typeof (value as Record<string, unknown>)['selector'] === 'string' &&
        typeof (value as Record<string, unknown>)['iframeSelector'] === 'string' &&
        typeof (value as Record<string, unknown>)['tagName'] === 'string' &&
        typeof (value as Record<string, unknown>)['role'] === 'string' &&
        typeof (value as Record<string, unknown>)['name'] === 'string' &&
        typeof (value as Record<string, unknown>)['text'] === 'string' &&
        typeof (value as Record<string, unknown>)['html'] === 'string';
}

function createValidators() {
  return {
    hasOptionalField: (
      value: Record<string, unknown>,
      key: string,
      predicate: (next: unknown) => boolean
    ) => (Object.prototype.hasOwnProperty.call(value, key) ? predicate(value[key]) : true),
    isNullable: createNullablePredicate,
    isNumber: (value: unknown): value is number => typeof value === 'number',
    isRecord: (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null,
    isScenarioStringDataRecord: (value: unknown): value is SuggestedEventTestDataRecord =>
      typeof value === 'object' && value !== null,
    isScenarioSuggestedEventKind: (value: unknown): value is ScenarioSuggestedEventKind =>
      value === 'click',
    isScenarioTargetDescriptor: isScenarioTargetDescriptorStub,
    isString: (value: unknown): value is string => typeof value === 'string',
  };
}

it('parses suggested events and normalizes fallback values', () => {
  const event = parseSuggestedEvent(
    {
      id: 'event-1',
      kind: 'click',
      message: 'Clicked CTA',
      createdAt: 40,
      status: 'unknown',
      sourceStepId: 'capture-1',
      target: null,
      data: { ctrl: true, attempts: 2 },
    },
    0,
    createValidators()
  );

  expect(event).toEqual(
    expect.objectContaining({
      id: 'event-1',
      status: 'pending',
      data: { ctrl: true, attempts: 2 },
    })
  );
});

it('rejects invalid suggested events', () => {
  const event = parseSuggestedEvent(
    {
      id: 'event-2',
      kind: 'invalid',
      message: 'Ignore',
      createdAt: 41,
      status: 'pending',
    },
    0,
    createValidators()
  );

  expect(event).toBeNull();
});
