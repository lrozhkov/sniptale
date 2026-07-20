import { expect, it } from 'vitest';

import * as contentSections from '.';

it('exports the canonical content-sections owner surface', () => {
  expect(contentSections.EditorInspectorDocumentActionsSection).toBeTypeOf('function');
  expect(contentSections.renderEditorInspectorContentBody).toBeTypeOf('function');
});
