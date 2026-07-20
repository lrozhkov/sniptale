type EditableTextTarget = import('fabric').FabricObject & {
  enterEditing?: () => void;
  exitEditing?: () => void;
  isEditing?: boolean;
  selectAll?: () => void;
};

interface ActivateTextTargetOptions {
  event?: import('fabric').TPointerEvent;
  selectAll?: boolean;
}

export function isTextTarget(target?: import('fabric').FabricObject): target is EditableTextTarget {
  return (
    target?.type === 'textbox' &&
    (target.sniptaleType === 'text' || target.sniptaleType === 'meta-stamp')
  );
}

export function activateTextTarget(
  canvas: import('fabric').Canvas,
  target: EditableTextTarget,
  syncRuntimeState: () => void,
  options: ActivateTextTargetOptions = {}
): void {
  const activeObject = canvas.getActiveObject() as EditableTextTarget | undefined;
  if (
    activeObject &&
    activeObject !== target &&
    activeObject.isEditing &&
    typeof activeObject.exitEditing === 'function'
  ) {
    activeObject.exitEditing();
  }

  if (canvas.getActiveObject() !== target) {
    canvas.setActiveObject(target, options.event);
  }
  if (!target.isEditing) {
    target.enterEditing?.();
    if (options.selectAll ?? true) {
      target.selectAll?.();
    }
  }

  canvas.requestRenderAll();
  syncRuntimeState();
}
