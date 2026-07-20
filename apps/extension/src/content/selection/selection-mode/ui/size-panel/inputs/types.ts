import type { Selection } from '../../../types';

export interface InputBindingOptions {
  minSelectionSize: number;
  maxWidth: number;
  maxHeight: number;
  getCurrentSelection: () => Selection;
  getMaintainAspectRatio: () => boolean;
  getAspectRatio: () => number | null;
}

export interface SizeChangeOptions {
  delta?: number;
  nextValue?: number;
  minSelectionSize: number;
  maxWidth: number;
  maxHeight: number;
  maintainAspectRatio: boolean;
  aspectRatio: number | null;
}

export interface DimensionInputBindingArgs {
  input: HTMLInputElement;
  pairedInput: HTMLInputElement;
  maxValue: number;
  minSelectionSize: number;
  getSelection: () => Selection;
  getCurrentValue: (selection: Selection) => number;
  getShouldSyncPairedInput: () => boolean;
  getPairedValue: (selection: Selection) => number;
  apply: (selection: Selection, value: number) => Selection;
  syncSelection: (selection: Selection) => void;
}
