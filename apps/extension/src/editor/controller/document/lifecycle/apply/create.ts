import type { ApplyEditorControllerDocumentOptions } from '../../apply-types';
import { createApplyEditorControllerDocumentSharedOptions } from '../../params';

export function createApplyEditorControllerDocumentParams(
  options: ApplyEditorControllerDocumentOptions
) {
  return {
    canvas: options.canvas,
    ...createApplyEditorControllerDocumentSharedOptions(options),
    syncRuntimeState: options.syncRuntimeState,
  };
}
