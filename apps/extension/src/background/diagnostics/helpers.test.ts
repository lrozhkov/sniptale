import { describe, expect, it, vi } from 'vitest';
import { createContentScriptDiagnosticEvent } from './helpers';
import type { DiagnosticEventFromCS } from '@sniptale/platform/observability/diagnostics/types';

function expectExplicitMessageTimestampWins() {
  const message = {
    kind: 'error',
    level: 'info',
    message: 'hello',
    tsMs: 42,
  } as DiagnosticEventFromCS;

  expect(
    createContentScriptDiagnosticEvent({
      createId: () => 'event-1',
      message,
      nowMs: 900,
      recordingId: 'recording-1',
      startedAt: 100,
    })
  ).toMatchObject({
    id: 'event-1',
    recordingId: 'recording-1',
    tsMs: 42,
    kind: 'error',
    level: 'info',
    message: 'hello',
  });
}

function expectTimestampGetsDerivedFromSessionStart() {
  const message = {
    kind: 'action',
    level: 'info',
    message: 'clicked',
  } as DiagnosticEventFromCS;

  expect(
    createContentScriptDiagnosticEvent({
      createId: () => 'event-2',
      message,
      nowMs: 550,
      recordingId: 'recording-2',
      startedAt: 100,
    }).tsMs
  ).toBe(450);
}

function expectMessagePayloadGetsSanitized() {
  const message = {
    kind: 'action',
    level: 'info',
    message: 'Saved value=' + 'x'.repeat(400),
    data: {
      password: 'secret',
      value: 'user input',
      nested: {
        text: 'freeform payload',
      },
    },
  } as DiagnosticEventFromCS;

  expect(
    createContentScriptDiagnosticEvent({
      createId: () => 'event-3',
      message,
      nowMs: 550,
      recordingId: 'recording-3',
      startedAt: 100,
    })
  ).toMatchObject({
    id: 'event-3',
    message: expect.stringContaining('[truncated]'),
    data: {
      password: '***',
      value: '***',
      nested: {
        text: '***',
      },
    },
  });
}

function expectDefaultIdFactoryAndUndefinedDataArePreserved() {
  const generatedId = '00000000-0000-4000-8000-000000000000';
  const randomUuidSpy = vi.spyOn(crypto, 'randomUUID').mockReturnValue(generatedId);

  const message = {
    kind: 'action',
    level: 'warn',
    message: 'fallback id path',
  } as DiagnosticEventFromCS;

  expect(
    createContentScriptDiagnosticEvent({
      message,
      nowMs: 200,
      recordingId: 'recording-4',
      startedAt: 50,
    })
  ).toMatchObject({
    id: generatedId,
    recordingId: 'recording-4',
    tsMs: 150,
    kind: 'action',
    level: 'warn',
    message: 'fallback id path',
  });
  expect(
    createContentScriptDiagnosticEvent({
      message,
      nowMs: 200,
      recordingId: 'recording-4',
      startedAt: 50,
    })
  ).not.toHaveProperty('data');

  randomUuidSpy.mockRestore();
}

function expectMissingLevelRemainsOmitted() {
  const message = {
    kind: 'action',
    message: 'raw token=123',
  } as DiagnosticEventFromCS;

  const event = createContentScriptDiagnosticEvent({
    createId: () => 'event-5',
    message,
    nowMs: 400,
    recordingId: 'recording-5',
    startedAt: 100,
  });

  expect(event).toMatchObject({
    id: 'event-5',
    message: 'raw token=***',
  });
  expect(event).not.toHaveProperty('level');
}

describe('diagnostic collector helpers', () => {
  it('uses explicit message timestamps when they are present', expectExplicitMessageTimestampWins);

  it(
    'derives timestamps from session start when the message omits tsMs',
    expectTimestampGetsDerivedFromSessionStart
  );

  it('sanitizes message payloads before they are persisted', expectMessagePayloadGetsSanitized);

  it(
    'uses the default id factory and preserves undefined data payloads',
    expectDefaultIdFactoryAndUndefinedDataArePreserved
  );

  it(
    'keeps level omitted when the content event does not provide it',
    expectMissingLevelRemainsOmitted
  );
});
