export interface SourceState {
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
