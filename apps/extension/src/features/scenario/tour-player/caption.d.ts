import type {
  TourHotspot,
  TourAnnotation,
  TourTextAppearance,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import type { TourPlayerLabels } from './document';

/** One mounted explanation owns its disposable disclosure state. */
export function createTourCaption(
  hint: HTMLElement,
  text: HTMLElement,
  labels: Pick<TourPlayerLabels, 'expand' | 'collapse' | 'details'>,
  redraw: () => void,
  signal: AbortSignal
): {
  reset(): void;
  prepare(
    current: Pick<TourAnnotation, 'id' | 'text'> & Partial<Pick<TourHotspot, 'label' | 'point'>>,
    presentation: TourTextAppearance['presentation']
  ): void;
  finish(): void;
};
