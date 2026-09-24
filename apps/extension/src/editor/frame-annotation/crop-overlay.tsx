import React from 'react';
import type { Canvas } from 'fabric';
import type { EditorTool } from '../../features/editor/document/types';
import { EDITOR_CANVAS_CROP_OVERLAY } from '../color/palette/constants';
import { getEditorWorkspaceMargin } from '../controller/viewport/editing-surface';
import { useEditorStore } from '../state/useEditorStore';

type CropBounds = { left: number; top: number; width: number; height: number };

export function EditorCropOverlay(props: {
  activeTool: EditorTool;
  canvas: Canvas | null;
  documentSize: { width: number; height: number };
}) {
  const [bounds, setBounds] = React.useState<CropBounds | null>(null);
  const { canvas, activeTool } = props;
  const canvasCropMode = useEditorStore((state) => state.canvasCropMode);

  React.useEffect(() => {
    if (!canvas || activeTool !== 'crop') {
      setBounds(null);
      return;
    }
    const sync = () => {
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
  }, [canvas, activeTool]);

  if (activeTool !== 'crop' || !bounds) return null;
  const margin = canvasCropMode === 'expand' ? getEditorWorkspaceMargin(props.documentSize) : 0;
  const width = props.documentSize.width + margin * 2;
  const height = props.documentSize.height + margin * 2;
  const hole = [
    `M ${bounds.left + margin} ${bounds.top + margin}`,
    `h ${bounds.width} v ${bounds.height} h ${-bounds.width} Z`,
  ].join(' ');
  return (
    <svg
      data-ui="editor.crop-overlay"
      aria-hidden="true"
      width={width}
      height={height}
      style={{ position: 'absolute', left: -margin, top: -margin, pointerEvents: 'none' }}
    >
      <path
        d={`M 0 0 H ${width} V ${height} H 0 Z ${hole}`}
        fill={EDITOR_CANVAS_CROP_OVERLAY}
        fillRule="evenodd"
      />
    </svg>
  );
}
