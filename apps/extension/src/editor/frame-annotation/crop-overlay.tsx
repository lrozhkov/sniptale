import React from 'react';
import type { Canvas } from 'fabric';
import type { EditorTool } from '../../features/editor/document/types';
import { EDITOR_CANVAS_CROP_OVERLAY } from '../color/palette/constants';
import { getEditorCanvasWorkspaceInsets } from '../controller/viewport/editing-surface';
import type { EditorWorkspaceInsets } from '../controller/viewport/workspace-extent';
import { useEditorStore } from '../state/useEditorStore';

type CropBounds = { left: number; top: number; width: number; height: number };

export function EditorCropOverlay(props: {
  activeTool: EditorTool;
  canvas: Canvas | null;
  documentSize: { width: number; height: number };
}) {
  const [bounds, setBounds] = React.useState<CropBounds | null>(null);
  const [insets, setInsets] = React.useState<EditorWorkspaceInsets>(() =>
    getEditorCanvasWorkspaceInsets(props.canvas, props.documentSize)
  );
  const { canvas, activeTool } = props;
  const canvasCropMode = useEditorStore((state) => state.canvasCropMode);

  React.useEffect(() => {
    if (!canvas || activeTool !== 'crop') {
      setBounds(null);
      return;
    }
    const sync = () => {
      const nextInsets = getEditorCanvasWorkspaceInsets(canvas, props.documentSize);
      setInsets((current) =>
        Object.keys(nextInsets).every(
          (side) =>
            current[side as keyof EditorWorkspaceInsets] ===
            nextInsets[side as keyof EditorWorkspaceInsets]
        )
          ? current
          : nextInsets
      );
      const guide = canvas
        .getObjects()
        .find((object) => object.sniptaleRole === 'crop-guide' && object.visible !== false);
      const next = guide?.getBoundingRect() ?? null;
      setBounds((current) =>
        current?.left === next?.left &&
        current?.top === next?.top &&
        current?.width === next?.width &&
        current?.height === next?.height
          ? current
          : next
      );
    };
    canvas.on('after:render', sync);
    sync();
    return () => canvas.off('after:render', sync);
  }, [canvas, activeTool, props.documentSize]);

  if (activeTool !== 'crop' || !bounds) return null;
  const margin = canvasCropMode === 'expand' ? insets : { left: 0, top: 0, right: 0, bottom: 0 };
  const width = props.documentSize.width + margin.left + margin.right;
  const height = props.documentSize.height + margin.top + margin.bottom;
  const hole = [
    `M ${bounds.left + margin.left} ${bounds.top + margin.top}`,
    `h ${bounds.width} v ${bounds.height} h ${-bounds.width} Z`,
  ].join(' ');
  return (
    <svg
      data-ui="editor.crop-overlay"
      aria-hidden="true"
      width={width}
      height={height}
      style={{ position: 'absolute', left: -margin.left, top: -margin.top, pointerEvents: 'none' }}
    >
      <path
        d={`M 0 0 H ${width} V ${height} H 0 Z ${hole}`}
        fill={EDITOR_CANVAS_CROP_OVERLAY}
        fillRule="evenodd"
      />
    </svg>
  );
}
