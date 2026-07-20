import { expect, it } from 'vitest';

import { parseChromeAiScenarioResponse } from './response';

it('parses scenario v3 operation payloads without using legacy step patches', () => {
  expect(
    parseChromeAiScenarioResponse(
      '{"operations":[{"slideId":"slide-1","title":"Updated","type":"setSlideTitle"}]}',
      3
    )
  ).toMatchObject({
    operations: [{ slideId: 'slide-1', title: 'Updated', type: 'setSlideTitle' }],
    success: true,
  });
});

it('returns deterministic parse failures for invalid scenario responses', () => {
  const invalidSchemaResponse = parseChromeAiScenarioResponse(
    '{"steps":"broken","note":"token=secret page text"}'
  );
  expect(invalidSchemaResponse).toMatchObject({
    success: false,
    error: expect.any(String),
    parseError: expect.stringMatching(/^invalid-schema:\d+$/u),
  });
  expect(JSON.stringify(invalidSchemaResponse)).not.toContain('token=secret');
  expect(JSON.stringify(invalidSchemaResponse)).not.toContain('page text');

  const invalidJsonResponse = parseChromeAiScenarioResponse('not-json token=secret');
  expect(invalidJsonResponse).toMatchObject({
    success: false,
    error: expect.any(String),
    parseError: 'invalid-json',
  });
  expect(JSON.stringify(invalidJsonResponse)).not.toContain('token=secret');
});

it('returns deterministic parse failures for invalid scenario v3 operation responses', () => {
  const response = parseChromeAiScenarioResponse(
    '{"operations":"broken","note":"token=secret"}',
    3
  );

  expect(response).toMatchObject({
    success: false,
    error: expect.any(String),
    parseError: expect.stringMatching(/^invalid-schema:\d+$/u),
  });
  expect(JSON.stringify(response)).not.toContain('token=secret');
});
