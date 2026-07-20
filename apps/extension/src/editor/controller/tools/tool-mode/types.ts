import type { EditorTool } from '../../../../features/editor/document/types';

export type RasterInteractionTool = Extract<EditorTool, 'selection' | 'brush' | 'eraser' | 'fill'>;
