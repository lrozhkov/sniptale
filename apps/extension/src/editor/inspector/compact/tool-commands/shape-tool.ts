import type { ToolCommandParams } from './types';

export function resolveShapeTool(params: ToolCommandParams) {
  return params.highlightedTool === 'ellipse'
    ? 'ellipse'
    : params.highlightedTool === 'diamond'
      ? 'diamond'
      : 'rectangle';
}
