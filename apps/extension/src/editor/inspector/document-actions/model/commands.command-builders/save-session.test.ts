import { Download, FileJson2, FileOutput, Save } from 'lucide-react';
import { expect, it } from 'vitest';

import { translate } from '../../../../../platform/i18n';
import { buildSaveSessionCommandBuilders } from './save-session';
import { createDocumentActionParams } from '../commands.test-support';

it('builds the save and session commands with stable labels and handlers', () => {
  const params = createDocumentActionParams();
  const builders = buildSaveSessionCommandBuilders(params, 'json-tag');

  expect(builders.exportSession).toMatchObject({
    id: 'export-session',
    kind: 'command',
    label: translate('editor.documentActions.exportSession'),
    icon: FileOutput,
    emphasis: 'tertiary',
    meta: 'json-tag',
  });
  expect(builders.exportSession.onClick).toBe(params.onExportSession);

  expect(builders.importSession).toMatchObject({
    id: 'import-session',
    kind: 'command',
    label: translate('editor.documentActions.importSession'),
    icon: FileJson2,
    emphasis: 'tertiary',
    meta: 'json-tag',
  });
  expect(builders.importSession.onClick).toBe(params.onImportSession);

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
