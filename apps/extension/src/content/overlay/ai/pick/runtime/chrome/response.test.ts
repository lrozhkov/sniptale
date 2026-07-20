import { expect, it } from 'vitest';

import { validateChromeAiJsonResponse } from './response';

it('strips fenced json wrappers before validating content ai payloads', () => {
  expect(
    validateChromeAiJsonResponse(
      '```json\n{"f":[{"c":"Old","id":"field-1","n":"Title","new":"New value"}],"i":"fill","t":[]}\n```'
    )
  ).toContain('{"f":[{"c":"Old","id":"field-1","n":"Title","new":"New value"}],"i":"fill","t":[]}');
});

it('throws when the cleaned chrome-ai payload is not valid editor json', () => {
  expect(() => validateChromeAiJsonResponse('```json\n{"broken":true}\n```')).toThrowError(
    /background\.runtime\.llmUnexpectedResponse|Validation error|Invalid/
  );
});
