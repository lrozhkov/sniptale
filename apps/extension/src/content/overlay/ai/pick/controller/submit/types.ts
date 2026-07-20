import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type { AiSubmitRequestGate } from './gate';

export type AiPickSubmitContext = {
  isAILoading: boolean;
  requestGate: AiSubmitRequestGate;
  resumeAiPickMode?: () => void;
  treeData: ParsedDOMTree | null;
  setIsAILoading: (value: boolean) => void;
  setIsAIModalOpen: (value: boolean) => void;
  setTreeData: (tree: ParsedDOMTree | null) => void;
};

export type AiSubmitRequest = {
  jsonData: string;
  modelId?: string | null;
  prompt: string;
};
