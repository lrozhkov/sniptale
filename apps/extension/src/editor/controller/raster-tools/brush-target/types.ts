import type { FabricObject } from 'fabric';
import type { EditorRasterTargetSnapshot } from '../../raster/types';

export type BrushTargetIntent =
  | { kind: 'blocked' }
  | { kind: 'create'; snapshot: EditorRasterTargetSnapshot }
  | { kind: 'existing'; object: FabricObject; snapshot: EditorRasterTargetSnapshot };
