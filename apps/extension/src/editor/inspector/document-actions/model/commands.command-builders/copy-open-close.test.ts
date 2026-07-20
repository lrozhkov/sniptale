import { ClipboardCopy, FilePlus2, X } from 'lucide-react';
import { expect, it } from 'vitest';

import { translate } from '../../../../../platform/i18n';
import { buildCopyOpenCloseCommandBuilders } from './copy-open-close';
import { createDocumentActionParams } from '../commands.test-support';

it('builds the close, copy, and open commands', () => {
  const params = createDocumentActionParams({
    copyRenderedImageDisabledReason: 'unsupported',
  });
  const builders = buildCopyOpenCloseCommandBuilders(params);

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

  expect(builders.openImage).toMatchObject({
    id: 'open-image',
    kind: 'command',
    label: translate('editor.documentActions.openImage'),
    icon: FilePlus2,
    emphasis: 'neutral',
  });
  expect(builders.openImage.onClick).toBe(params.onOpenImage);
});

it('omits the disabled reason when copy stays available', () => {
  const builders = buildCopyOpenCloseCommandBuilders(createDocumentActionParams());

  expect(builders.copyPng.disabled).toBe(false);
  expect('disabledReason' in builders.copyPng).toBe(false);
});
