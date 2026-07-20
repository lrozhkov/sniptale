import { Download, Save } from 'lucide-react';
import { expect, it } from 'vitest';

import { translate } from '../../../../../../platform/i18n';
import { createDocumentActionParams } from '../../commands.test-support';
import { buildSaveImageCommandBuilders } from './image';

it('builds the save image commands with stable labels and handlers', () => {
  const params = createDocumentActionParams();
  const builders = buildSaveImageCommandBuilders(params);

  expect(builders.saveImage).toMatchObject({
    id: 'save-image',
    kind: 'command',
    label: translate('editor.documentActions.download'),
    icon: Download,
    emphasis: 'primary',
  });
  expect(builders.saveImage.onClick).toBe(params.onSaveImage);

  expect(builders.saveImageAs).toMatchObject({
    id: 'save-image-as',
    kind: 'command',
    label: translate('editor.documentActions.downloadAs'),
    icon: Save,
    emphasis: 'secondary',
  });
  expect(builders.saveImageAs.onClick).toBe(params.onSaveImageAs);
});
