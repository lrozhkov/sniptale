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
    authoring?: {
      canEdit?(): boolean;
      onSelectObject(objectId: string | null): void;
      onResizeObject?(objectId: string, rect: TourRect): void;
      onMoveObject(objectId: string, point: { x: number; y: number }): void;
    };
  }
): {
  update(input: TourPlayerInput): void;
  select(slideId: string): void;
  selectEnd(): void;
  selectObject(objectId: string | null): void;
  dispose(): void;
};
