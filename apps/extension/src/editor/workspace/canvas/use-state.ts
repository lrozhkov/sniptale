import { useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../../state/useEditorStore';

export function useCanvasWrapperState() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const openImageInputRef = useRef<HTMLInputElement>(null);

  const store = useEditorStore(
    useShallow((state) => ({
      layers: state.layers,
      selection: state.selection,
      setImageData: state.setImageData,
      zoomPercent: state.viewport.zoomPercent,
      backgroundColor: state.workspace.backgroundColor,
      gridEnabled: state.workspace.gridEnabled,
      gridColor: state.workspace.gridColor,
      gridSize: state.workspace.gridSize,
    }))
  );

  return {
    viewportRef,
    stageRef,
    surfaceRef,
    canvasRef,
    openImageInputRef,
    ...store,
  };
}
