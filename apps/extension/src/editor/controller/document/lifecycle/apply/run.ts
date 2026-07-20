import { runApplyEditorControllerDocument } from '../../runner';
import { createApplyEditorControllerDocumentParams } from './create';
import type { ApplyEditorControllerDocumentOptions } from '../../apply-types';

export async function applyEditorControllerDocument(
  options: ApplyEditorControllerDocumentOptions
): Promise<void> {
  await runApplyEditorControllerDocument(createApplyEditorControllerDocumentParams(options));
}
