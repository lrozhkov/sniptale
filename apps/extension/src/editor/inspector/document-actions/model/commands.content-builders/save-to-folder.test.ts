import { expect, it } from 'vitest';

import { translate } from '../../../../../platform/i18n';
import { buildSaveToFolderContent } from './save-to-folder';
import { createDocumentActionParams } from '../commands.test-support';

it('builds the save-to-folder content entry', () => {
  const params = createDocumentActionParams();
  const content = buildSaveToFolderContent(params, translate);

  expect(content).toMatchObject({
    id: 'save-to-folder',
    kind: 'content',
    label: translate('editor.documentActions.saveToFolder'),
    note: translate('editor.compact.saveToFolderNote'),
  });
  expect(content.content).toBe('save preset options');
  expect(content.value).toBeUndefined();
});
