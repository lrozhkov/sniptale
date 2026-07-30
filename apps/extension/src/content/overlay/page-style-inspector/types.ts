import type { PageStylePatch, PageStyleProperty } from '@sniptale/runtime-contracts/page-style';
import type {
  PageStyleDeclarationValueMap,
  PageStyleSelectionSnapshot,
} from './runtime/properties';

export interface PageStyleInspectorViewState {
  comment: PageStyleInspectorCommentViewState;
  defaultValues: PageStyleDeclarationValueMap;
  draftPatch: PageStylePatch;
  modifiedProperties: PageStyleProperty[];
  selection: PageStyleSelectionSnapshot | null;
  sideFieldLinks?: Record<string, boolean>;
  values: PageStyleDeclarationValueMap;
}

interface PageStyleInspectorCommentViewState {
  commitFailed: boolean;
  draft: string;
  marker: number | null;
}

export interface PageStyleInspectorActions {
  close: () => void;
  comment: PageStyleInspectorCommentActions;
  resetValue: (property: PageStyleProperty) => void;
  setSideFieldLinked?: (fieldKey: string, linked: boolean) => void;
  updateValue: (property: PageStyleProperty, value: string) => void;
  updateValues: (updates: Array<{ property: PageStyleProperty; value: string }>) => void;
}

interface PageStyleInspectorCommentActions {
  commit: () => boolean;
  endComposition: (value: string) => void;
  startComposition: () => void;
  updateDraft: (value: string) => void;
}
