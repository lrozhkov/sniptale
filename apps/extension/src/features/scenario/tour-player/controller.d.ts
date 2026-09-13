import type { TourDocument } from '@sniptale/runtime-contracts/scenario/types/tour';
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
  input: TourPlayerInput
): {
  select(slideId: string): void;
  dispose(): void;
};
