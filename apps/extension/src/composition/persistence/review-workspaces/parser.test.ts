import { expect, it } from 'vitest';
import {
  createQuickEditAdvancedContent,
  createQuickEditAdvancedState,
} from '../../../features/video/review/advanced/defaults';
import { inspectVideoWorkspace } from './parser';

function workspace() {
  return {
    aggregateId: 'private-record',
    sourceAssetId: 'private-asset',
    formatVersion: 1,
    source: { duration: 10, width: 640, height: 360, size: 6, mimeType: 'video/webm' },
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    cursor: 0,
    history: [],
    advanced: createQuickEditAdvancedState(),
  };
}
it('identifies no-change history position in the retained redo suffix without content', () => {
  const content = createQuickEditAdvancedContent();
  const raw = {
    ...workspace(),
    history: [
      {
        id: 'private-operation',
        at: 1,
        target: 'advancedContent',
        before: content,
        after: content,
      },
    ],
  };
  const result = inspectVideoWorkspace(raw);
  expect(result.workspace).toBeNull();
  expect(result.failure).toEqual({
    check: 'history-replay',
    reason: 'no-change',
    operationIndex: 0,
    target: 'advancedContent',
    cursor: 0,
    historyLength: 1,
  });
  expect(JSON.stringify(result.failure)).not.toMatch(/private|schemaVersion|regions/);
});
it('locates malformed and duplicate operations separately', () => {
  const operation = {
    id: 'private-operation',
    at: 1,
    target: 'annotation',
    before: null,
    after: { id: 'private-note', text: 'PRIVATE_CONTENT', anchor: { kind: 'point', time: 1 } },
  };
  expect(
    inspectVideoWorkspace({ ...workspace(), history: [operation, operation] }).failure
  ).toMatchObject({ check: 'history-operation', reason: 'duplicate-operation', operationIndex: 1 });
  expect(
    inspectVideoWorkspace({ ...workspace(), history: [{ secret: 'PRIVATE_CONTENT' }] }).failure
  ).toMatchObject({ check: 'history-operation', reason: 'invalid', operationIndex: 0 });
});
it('separates source and advanced-state validation while retaining strict admission', () => {
  expect(inspectVideoWorkspace({ ...workspace(), source: null }).failure?.check).toBe(
    'source-metadata'
  );
  expect(
    inspectVideoWorkspace({ ...workspace(), advanced: { schemaVersion: 999 } }).failure?.check
  ).toBe('advanced-state');
  expect(inspectVideoWorkspace(workspace()).failure).toBeNull();
});
it('bounds diagnostic counts and never copies arbitrary values', () => {
  const result = inspectVideoWorkspace({
    ...workspace(),
    cursor: 999999999,
    filename: 'PRIVATE_CONTENT',
  });
  expect(result.failure).toMatchObject({
    check: 'workspace-envelope',
    cursor: 1000000,
    historyLength: 0,
  });
  expect(JSON.stringify(result.failure)).not.toContain('PRIVATE_CONTENT');
});
