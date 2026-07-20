import { FileJson2, FileOutput } from 'lucide-react';
import { expect, it } from 'vitest';

import { translate } from '../../../../../../platform/i18n';
import { createDocumentActionParams } from '../../commands.test-support';
import { buildSessionCommandBuilders } from './session';

it('builds the session commands with the json tag metadata', () => {
  const params = createDocumentActionParams();
  const builders = buildSessionCommandBuilders(params, 'json-tag');

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
});
