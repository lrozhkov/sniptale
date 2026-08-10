import { expect, it } from 'vitest';

import { buildGridStyleCommands } from './compact/inspector/grid-style-sections';
import { buildRichShapeCompactCommands } from './compact/tool-commands/rich-shape';
import { buildStepCompactCommands } from './tools/tool-inspector/session-sections';
import { createInspectorCommandParams } from '../../../../../tooling/test/harness/editor/ownership/fixtures';

it('keeps retained editor inspector commands reachable through the owner test project', () => {
  const params = createInspectorCommandParams();
  expect(buildGridStyleCommands(params as never).length).toBeGreaterThan(0);
  expect(buildStepCompactCommands(params as never).length).toBeGreaterThan(0);
  expect(buildRichShapeCompactCommands(params as never)).toEqual([]);
});
