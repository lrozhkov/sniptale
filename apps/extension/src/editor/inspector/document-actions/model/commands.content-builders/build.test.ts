import { expect, it } from 'vitest';

import { translate } from '../../../../../platform/i18n';
import { buildDocumentActionContentBuilders } from './build';
import { createDocumentActionParams } from '../commands.test-support';

it('builds both content builders through the owner-local role files', () => {
  const params = createDocumentActionParams();
  const builders = buildDocumentActionContentBuilders(params);

  expect(builders.saveToFolder).toMatchObject({
    id: 'save-to-folder',
    kind: 'content',
    label: translate('editor.documentActions.saveToFolder'),
    note: translate('editor.compact.saveToFolderNote'),
  });
  expect(builders.saveToFolder.content).toBe('save preset options');
  expect(builders.saveToFolder.value).toBeUndefined();

  expect(builders.imageFormat).toMatchObject({
    id: 'image-format',
    kind: 'content',
    label: translate('imageSettings.section.formatLabel'),
    note: translate('editor.compact.exportSettingsNote'),
  });
  expect(builders.imageFormat.content).toBe('image format');
});
