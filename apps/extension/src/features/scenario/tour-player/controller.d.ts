import type { TourDocument, TourRect } from '@sniptale/runtime-contracts/scenario/types/tour';
import type { TourPlayerLabels } from './document';

/** Trusted renderer inputs prepared by the document builder or owning editor session. */
interface TourPlayerInput {
  tour: TourDocument;
  assets: readonly { id: string; src: string }[];
  labels: TourPlayerLabels;
}

/** Owns one mounted scene; disposal is idempotent and stops subsequent selection. */
export function createTourPlayer(
  root: HTMLElement,
  input: TourPlayerInput,
  options?: {
    /** Start playback at this slide without an intervening manual navigation pause. */
    initialSlideId?: string;
    /** Bounded editor preview: interactive with audio, but URL actions never navigate. */
    preview?: boolean;
    authoring?:
      | {
          cameraFrame?: boolean;
          onFrameCamera?(camera: { center: { x: number; y: number }; zoom: number }): void;
          canEdit?(): boolean;
          /** Disposable editor selection; navigation never executes authored actions. */
          navigation?: {
            canMove(direction: -1 | 1): boolean;
            move(direction: -1 | 1): void;
            selectSlide(slideId: string): void;
          };
          onSelectObject(objectId: string | null): void;
          onResizeObject?(objectId: string, rect: TourRect): void;
          onMoveObject(objectId: string, point: { x: number; y: number }): void;
        }
      | undefined;
  }
): {
  update(input: TourPlayerInput): void;
  select(slideId: string): void;
  selectEnd(): void;
  selectObject(objectId: string | null): void;
  dispose(): void;
};
