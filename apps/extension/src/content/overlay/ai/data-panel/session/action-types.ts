import type React from 'react';
import type { TreeNodeState } from '../types';

export type DataPanelActionBaseState = {
  dataContainerRef: React.RefObject<HTMLDivElement | null>;
  isDataSpoilerOpen: boolean;
  jsonPreviewRef: React.RefObject<HTMLPreElement | null>;
  setCopied: React.Dispatch<React.SetStateAction<boolean>>;
  setExcludedColumns: React.Dispatch<React.SetStateAction<Map<string, string[]>>>;
  setIsDataResizing: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDataSpoilerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsJsonResizing: React.Dispatch<React.SetStateAction<boolean>>;
  setTreeState: React.Dispatch<React.SetStateAction<Map<string, TreeNodeState>>>;
};

export type DataPanelActionDerivedState = {
  formattedJSON: string;
  isAnyExpanded: boolean;
  isAnySelected: boolean;
};
