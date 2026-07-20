import type { Path } from 'fabric';
import type { EditorObjectType } from '../../../../features/editor/document/types';

export type FreehandTool = Extract<EditorObjectType, 'pencil' | 'highlighter'>;
export type PositionedFreehandPath = Pick<Path, 'left' | 'top' | 'pathOffset'>;
