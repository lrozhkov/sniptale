import type { EditorControllerInstance } from '../../instance/types';

export function createEditorControllerBrowserFrameTokenMutators(
  controller: EditorControllerInstance
) {
  return {
    createBrowserFrameRenderToken: () => {
      controller.browserFrameRenderToken += 1;
      return controller.browserFrameRenderToken;
    },
    isBrowserFrameRenderTokenCurrent: (token: number) =>
      controller.browserFrameRenderToken === token,
  };
}
