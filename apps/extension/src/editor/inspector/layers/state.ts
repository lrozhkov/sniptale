import React from 'react';
import type { EditorInspectorLayersPanelStateProps } from './types';

export function useLayerPanelState(args: EditorInspectorLayersPanelStateProps) {
  const [expanded, setExpanded] = useControllableLayerField(args.expanded, args.setExpanded);
  const [draggedLayerId, setDraggedLayerId] = useControllableLayerField(
    args.draggedLayerId,
    args.setDraggedLayerId
  );
  const [dragOverLayerId, setDragOverLayerId] = useControllableLayerField(
    args.dragOverLayerId,
    args.setDragOverLayerId
  );
  const [autoNavigateSelectedLayer, setAutoNavigateSelectedLayer] = React.useState(false);

  return {
    autoNavigateSelectedLayer,
    expanded,
    draggedLayerId,
    dragOverLayerId,
    setAutoNavigateSelectedLayer,
    setExpanded,
    setDraggedLayerId,
    setDragOverLayerId,
  };
}

function useControllableLayerField<T>(
  value: T,
  setter?: React.Dispatch<React.SetStateAction<T>>
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [fallbackValue, setFallbackValue] = React.useState(value);

  React.useEffect(() => {
    setFallbackValue(value);
  }, [value]);

  return [typeof setter === 'function' ? value : fallbackValue, setter ?? setFallbackValue];
}
