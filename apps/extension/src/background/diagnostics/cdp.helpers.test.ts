import { describe, expect, it } from 'vitest';
import { buildConsoleEventMessage, sanitizeStackTraceFrames } from './cdp.helpers';

function expectUndefinedFramesStayUndefined() {
  expect(sanitizeStackTraceFrames(undefined, 2)).toBeUndefined();
}

function expectFramesGetTrimmedAndSanitized() {
  expect(
    sanitizeStackTraceFrames(
      [
        {
          functionName: '',
          lineNumber: 12,
          url: undefined as unknown as string,
        },
        {
          functionName: 'renderWidget',
          lineNumber: 34,
          url: 'https://example.com/path?token=secret#hash',
        },
        {
          functionName: 'ignoredFrame',
          lineNumber: 99,
          url: 'https://example.com/ignored',
        },
      ],
      2
    )
  ).toEqual([
    {
      functionName: '<anonymous>',
      lineNumber: 12,
      url: '',
    },
    {
      functionName: 'renderWidget',
      lineNumber: 34,
      url: 'https://example.com/path',
    },
  ]);
}

function expectConsoleMessageUsesValueDescriptionAndEmptyFallback() {
  expect(
    buildConsoleEventMessage([
      {
        value: {
          password: 'secret',
        },
        description: 'ignored description',
      },
      {
        description: 'second segment',
      },
      {},
    ])
  ).toBe('{"password":"***"} second segment ');
}

describe('diagnostic collector cdp helpers', () => {
  it('returns undefined when stack frames are missing', expectUndefinedFramesStayUndefined);

  it('limits stack frames and sanitizes frame details', expectFramesGetTrimmedAndSanitized);

  it(
    'builds console messages from value, description, and empty fallbacks',
    expectConsoleMessageUsesValueDescriptionAndEmptyFallback
  );
});
