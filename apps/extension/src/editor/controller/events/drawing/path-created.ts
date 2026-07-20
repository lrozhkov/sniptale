import type { FabricObject } from 'fabric';
import { handleEditorPathCreated } from '../../draw-workflow';
import type {
  EditorControllerEventCommandBindings as CommandBindings,
  EditorControllerEventObjectBindings as ObjectBindings,
  EditorControllerEventStateBindings as StateBindings,
} from '../types';

export function createPathCreatedHandler(
  bindings: StateBindings &
    Pick<ObjectBindings, 'nextLabelIndex' | 'prepareObject'> &
    Pick<CommandBindings, 'commitHistory' | 'syncRuntimeState'>
) {
  return (event: { path: FabricObject }) => {
    handleEditorPathCreated({
      canvas: bindings.getCanvas(),
      path: event.path,
      activeTool: bindings.getActiveTool(),
      nextLabelIndex: (type) => bindings.nextLabelIndex(type),
      prepareObject: (object) => bindings.prepareObject(object),
      commitHistory: () => bindings.commitHistory(),
      syncRuntimeState: () => bindings.syncRuntimeState(),
    });
  };
}
