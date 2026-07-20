import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type { AiPickSourceResolver } from '../runtime/mode.types';
import type { AiSubmitRequestGate } from './submit/gate';

export interface UseAiPickControllerParams {
  aiPickSource?: AiPickSourceResolver | undefined;
  aiPickMode: boolean;
  preloadAIModal: () => Promise<void>;
  setAiPickMode: (enabled: boolean) => void;
  setHighlighterMode: (enabled: boolean) => void;
  setQuickEditDocumentMode: (enabled: boolean) => void;
  setQuickEditMode: (enabled: boolean) => void;
}

export interface UseAiPickControllerResult {
  handleAiPickContentStart: () => void;
  handleCancelAIPrompt: () => void;
  handleCloseAIModal: () => void;
  handleDisableAiPickMode: () => void;
  handleSubmitAIPrompt: (
    prompt: string,
    selectedData?: string,
    modelId?: string | null
  ) => Promise<void>;
  isAILoading: boolean;
  isAIModalOpen: boolean;
  treeData: ParsedDOMTree | null;
}

export type AiPickControllerContext = UseAiPickControllerParams & {
  beginAiPickEnableSession: () => number;
  cancelActiveAiRequest: () => void;
  invalidateAiPickEnableSession: () => void;
  isCurrentAiPickEnableSession: (epoch: number) => boolean;
  isAILoading: boolean;
  requestGate: AiSubmitRequestGate;
  resumeAiPickMode?: () => void;
  setIsAIModalOpen: (value: boolean) => void;
  setIsAILoading: (value: boolean) => void;
  setTreeData: (tree: ParsedDOMTree | null) => void;
  treeData: ParsedDOMTree | null;
};
