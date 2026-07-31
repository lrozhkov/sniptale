import type { PageStylePatch, PageStyleProperty } from '@sniptale/runtime-contracts/page-style';
import type { BrowserDesignReviewAction } from '../../parser/page-preparation/annotations';
import type {
  PageStyleDeclarationValueMap,
  PageStyleSelectionSnapshot,
} from '../../selection/design-review/snapshot';

export interface DesignReviewViewState {
  action: BrowserDesignReviewAction;
  anchor: { x: number; y: number } | null;
  comment: DesignReviewCommentViewState;
  defaultValues: PageStyleDeclarationValueMap;
  draftPatch: PageStylePatch;
  modifiedProperties: PageStyleProperty[];
  selection: PageStyleSelectionSnapshot | null;
  settingsOpen: boolean;
  sideFieldLinks?: Record<string, boolean>;
  values: PageStyleDeclarationValueMap;
}

interface DesignReviewCommentViewState {
  commitFailed: boolean;
  draft: string;
  marker: number | null;
}

export interface DesignReviewActions {
  close: () => void;
  comment: DesignReviewCommentActions;
  copyElement: () => Promise<void>;
  copyPath: () => Promise<void>;
  delete: () => void;
  resetValue: (property: PageStyleProperty) => void;
  selectAction: (action: BrowserDesignReviewAction) => void;
  setSideFieldLinked?: (fieldKey: string, linked: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  updateValue: (property: PageStyleProperty, value: string) => void;
  updateValues: (updates: Array<{ property: PageStyleProperty; value: string }>) => void;
}

interface DesignReviewCommentActions {
  commit: () => boolean;
  endComposition: (value: string) => void;
  startComposition: () => void;
  updateDraft: (value: string) => void;
}
