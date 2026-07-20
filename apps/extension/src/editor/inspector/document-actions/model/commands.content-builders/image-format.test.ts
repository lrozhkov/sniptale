import { expect, it } from 'vitest';

import { translate } from '../../../../../platform/i18n';
import { buildImageFormatContent } from './image-format';
import { createDocumentActionParams } from '../commands.test-support';

it('builds the image format content entry', () => {
  const params = createDocumentActionParams();
  const content = buildImageFormatContent(params, translate);

  expect(content).toMatchObject({
    id: 'image-format',
    kind: 'content',
    label: translate('imageSettings.section.formatLabel'),
    note: translate('editor.compact.exportSettingsNote'),
  });
  expect(content.content).toBe('image format');
});
