import { describe, expect, it } from 'vitest';
import { buildDocumentActionCommands } from './commands';
import { createDocumentActionParams } from './commands.test-support';

describe('editor-inspector-document-actions.model/commands', () => {
  it('keeps the stable facade exports wired together', () => {
    const commands = buildDocumentActionCommands(createDocumentActionParams(), 'json-tag');

    expect(commands.exportSession.meta).toBe('json-tag');
    expect(commands.saveToFolder.value).toBeUndefined();
  });
});
