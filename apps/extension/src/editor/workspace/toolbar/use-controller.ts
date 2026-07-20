import { useEditorController } from '../../application/controller-context';
import type { EditorToolbarContentProps } from './types';
import { buildEditorToolbarControllerProps } from './use-controller.helpers';
import { useEditorToolbarState } from './use-state';

export function useEditorToolbarController(hasImage: boolean): EditorToolbarContentProps {
  const controller = useEditorController();
  const state = useEditorToolbarState();
  return buildEditorToolbarControllerProps(state, hasImage, controller);
}
