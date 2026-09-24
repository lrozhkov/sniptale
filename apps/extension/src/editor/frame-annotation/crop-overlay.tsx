import React from 'react';
import type { Canvas } from 'fabric';
import type { EditorTool } from '../../features/editor/document/types';
import {
  EDITOR_CANVAS_CROP_GUIDE_STROKE,
  EDITOR_CANVAS_CROP_OVERLAY,
} from '../color/palette/constants';

type CropBounds = { left: number; top: number; width: number; height: number };

export function EditorCropOverlay(props: {
  activeTool: EditorTool;
  canvas: Canvas | null;
  documentSize: { width: number; height: number };
}) {
  const [bounds, setBounds] = React.useState<CropBounds | null>(null);
  const { canvas, activeTool } = props;

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
  const { width, height } = props.documentSize;
  const hole = `M ${bounds.left} ${bounds.top} h ${bounds.width} v ${bounds.height} h ${-bounds.width} Z`;
  return (
    <svg
      data-ui="editor.crop-overlay"
      aria-hidden="true"
      width={width}
      height={height}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2_147_483_647 }}
    >
      <path
        d={`M 0 0 H ${width} V ${height} H 0 Z ${hole}`}
        fill={EDITOR_CANVAS_CROP_OVERLAY}
        fillRule="evenodd"
      />
      <rect
        x={bounds.left}
        y={bounds.top}
        width={bounds.width}
        height={bounds.height}
        fill="none"
        stroke={EDITOR_CANVAS_CROP_GUIDE_STROKE}
        strokeWidth={2}
        strokeDasharray="6 4"
      />
    </svg>
  );
}
