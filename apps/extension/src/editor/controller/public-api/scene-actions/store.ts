import { useEditorStore } from '../../../state/useEditorStore';
import type { EditorSceneStoreBridge } from '../../public-actions/scene/helpers';

export function createEditorSceneStoreBridge(): EditorSceneStoreBridge {
  return {
    getBrowserFrame: () => useEditorStore.getState().browserFrame,
    getFrame: () => useEditorStore.getState().frame,
    setBrowserFrame: (nextBrowserFrame) =>
      useEditorStore.getState().setBrowserFrame(nextBrowserFrame),
    updateFrame: (frame) => useEditorStore.getState().updateFrame(frame),
  };
}
