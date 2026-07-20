import type { EditorTool } from '../../../../features/editor/document/types';
import type {
  EditorTechnicalDataKind,
  EditorTechnicalDataLayout,
} from '../../tools/technical-data';

export interface EditorControllerInstanceLifecycleActions {
  mount(
    canvasElement: HTMLCanvasElement,
    viewportElement: HTMLElement,
    stageElement: HTMLElement
  ): void;
  dispose(): void;
  setActiveTool(tool: EditorTool): void;
  suspendToolMode(): void;
  setCropSelectionMouseEnabled(enabled: boolean): void;
  insertImage(dataUrl: string, name?: string | null): Promise<void>;
  insertTechnicalData(
    kinds: readonly EditorTechnicalDataKind[],
    layout?: EditorTechnicalDataLayout
  ): void;
  clearCropSelection(): void;
  previewCanvasSize(width: number, height: number): void;
  clearCanvasSizePreview(): void;
  cancelCropMode(): void;
  applyCropSelection(): Promise<void>;
}
