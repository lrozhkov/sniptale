import type { RootSelectionCandidateSource } from '@sniptale/runtime-contracts/dom-tree';

export type RootSelectionCandidate = {
  element: HTMLElement;
  source: RootSelectionCandidateSource;
  selector: string;
  score: number;
  textLength: number;
  linkDensity: number;
  reasons: string[];
};
