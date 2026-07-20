import type {
  EditorControllerInstance,
  EditorControllerPublicApiAdapter,
} from '../../instance/types';

import { createEditorControllerPublicApiMethods } from './methods';
import { createEditorControllerPublicApiMutators } from './mutators';
import { createEditorControllerPublicApiView } from './view';

export function createEditorControllerPublicApiAdapter(
  controller: EditorControllerInstance
): EditorControllerPublicApiAdapter {
  const view = createEditorControllerPublicApiView(controller);
  const adapter = {
    ...createEditorControllerPublicApiMethods(controller),
    ...createEditorControllerPublicApiMutators(controller),
  };

  return Object.defineProperties(
    adapter,
    Object.getOwnPropertyDescriptors(view)
  ) as EditorControllerPublicApiAdapter;
}
