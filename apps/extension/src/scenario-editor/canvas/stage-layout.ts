import type { CSSProperties } from 'react';
import type { ScenarioCanvasRenderedSlide } from './stage-types';
import type { ScenarioCanvasViewportInsets } from './viewport';

export function resolveCanvasViewportLayout(args: {
  canvas: ScenarioCanvasRenderedSlide['canvas'];
  scale: number;
  viewportInsets?: ScenarioCanvasViewportInsets | undefined;
  withFloatingControls: boolean;
}): { className: string; style: CSSProperties } {
  if (args.withFloatingControls || !args.viewportInsets) {
    return {
      className: 'grid min-h-full min-w-full place-items-center px-8 pb-10 pt-20',
      style: {
        minHeight: args.canvas.height * args.scale + 120,
        minWidth: args.canvas.width * args.scale + 64,
      },
    };
  }

  return {
    className: 'grid min-h-full min-w-full place-items-center',
    style: {
      boxSizing: 'border-box',
      minHeight:
        args.canvas.height * args.scale + args.viewportInsets.top + args.viewportInsets.bottom,
      minWidth:
        args.canvas.width * args.scale + args.viewportInsets.left + args.viewportInsets.right,
      paddingBottom: args.viewportInsets.bottom,
      paddingLeft: args.viewportInsets.left,
      paddingRight: args.viewportInsets.right,
      paddingTop: args.viewportInsets.top,
    },
  };
}
