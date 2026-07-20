import { createRequire } from 'node:module';

import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);

it('registers a scenario-editor runtime isolation rule against editor imports', () => {
  const config = require('../../../../.dependency-cruiser.cjs');
  const scenarioRule = config.forbidden.find(
    (rule: { name: string }) => rule.name === 'runtime-isolation-scenario-editor'
  );

  expect(scenarioRule).toEqual(
    expect.objectContaining({
      from: expect.objectContaining({
        path: '^apps/extension/src/scenario-editor/',
      }),
    })
  );
  expect(scenarioRule?.to?.path).toContain('apps/extension/src/editor');
});

it('keeps viewer content reuse one-way while blocking other runtime imports', () => {
  const config = require('../../../../.dependency-cruiser.cjs');
  const contentRule = config.forbidden.find(
    (rule: { name: string }) => rule.name === 'runtime-isolation-content'
  );
  const viewerRule = config.forbidden.find(
    (rule: { name: string }) => rule.name === 'runtime-isolation-web-snapshot-viewer'
  );

  expect(contentRule?.to?.path).toContain('apps/extension/src/web-snapshot-viewer');
  expect(viewerRule?.to?.path).not.toContain('apps/extension/src/content');
  expect(viewerRule?.to?.path).toContain('apps/extension/src/editor');
});

it('limits viewer content reuse to the preparation owner', () => {
  const config = require('../../../../.dependency-cruiser.cjs');
  const viewerContentReuseRule = config.forbidden.find(
    (rule: { name: string }) => rule.name === 'web-snapshot-viewer-content-reuse-scope'
  );

  expect(viewerContentReuseRule).toEqual(
    expect.objectContaining({
      from: expect.objectContaining({
        path: '^apps/extension/src/web-snapshot-viewer/(?!preparation/)',
      }),
      to: expect.objectContaining({
        path: '^apps/extension/src/content/',
      }),
    })
  );
});
