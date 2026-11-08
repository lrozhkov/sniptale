import type { EditorCompositionBase } from '../../../features/editor/document/types';

export interface SourceState {
  compositionBase?: EditorCompositionBase;
  id: string;
  dataUrl: string;
  name: string | null;
  intrinsicWidth: number;
  intrinsicHeight: number;
  left: number;
  top: number;
  displayWidth: number;
  displayHeight: number;
  visible: boolean;
  locked: boolean;
}
