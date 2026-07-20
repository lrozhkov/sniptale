import { ClipboardCopy, Download, FileJson2, FileOutput, FilePlus2, Save, X } from 'lucide-react';
import { expect, it } from 'vitest';
import { translate } from '../../../../platform/i18n';
import { buildDocumentActionCommandBuilders } from './commands';
import { createDocumentActionParams } from './commands.test-support';

it('builds the close and copy commands', () => {
  const params = createDocumentActionParams({
    copyRenderedImageDisabledReason: 'unsupported',
  });
  const builders = buildDocumentActionCommandBuilders(params, 'json-tag');

  expect(builders.closeFile).toMatchObject({
    id: 'close-file',
    kind: 'command',
    label: translate('editor.documentActions.closeFile'),
    icon: X,
    emphasis: 'neutral',
  });
  expect(builders.closeFile.onClick).toBe(params.onCloseDocument);

  expect(builders.copyPng).toMatchObject({
    id: 'copy-png',
    kind: 'command',
    label: translate('editor.documentActions.copyPng'),
    icon: ClipboardCopy,
    emphasis: 'secondary',
    disabled: true,
    disabledReason: 'unsupported',
  });
  expect(builders.copyPng.onClick).toBe(params.onCopyRenderedImage);
});

it('builds the session commands with the json tag metadata', () => {
  const params = createDocumentActionParams();
  const builders = buildDocumentActionCommandBuilders(params, 'json-tag');

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

it('builds the open and save commands with stable labels and handlers', () => {
  const params = createDocumentActionParams();
  const builders = buildDocumentActionCommandBuilders(params, 'json-tag');

  expect(builders.openImage).toMatchObject({
    id: 'open-image',
    kind: 'command',
    label: translate('editor.documentActions.openImage'),
    icon: FilePlus2,
    emphasis: 'neutral',
  });
  expect(builders.openImage.onClick).toBe(params.onOpenImage);

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
