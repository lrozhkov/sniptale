export type RasterInteractionTool = 'selection' | 'brush' | 'eraser' | 'fill';

export function isRasterEditorTool(tool: string): tool is RasterInteractionTool {
  return tool === 'selection' || tool === 'brush' || tool === 'eraser' || tool === 'fill';
}
