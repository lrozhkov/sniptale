export type SelectionState = 'idle' | 'hover' | 'drag' | 'confirmed';

export interface Selection {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}
