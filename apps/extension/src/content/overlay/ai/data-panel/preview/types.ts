import type React from 'react';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type { TreeRenderProps } from '../tree-view';

export type DataSelectionPreviewProps = {
  dataContainerRef: React.RefObject<HTMLDivElement | null>;
  getSummaryToneClass: () => string;
  handleDataResizeStart: (event: React.MouseEvent) => void;
  handleToggleSpoiler: () => void;
  isAnyExpanded: boolean;
  isAnySelected: boolean;
  isDataResizing: boolean;
  isDataSpoilerOpen: boolean;
  isLoading: boolean;
  spoilerSummary: string;
  toggleExpandAll: () => void;
  toggleSelectAll: () => void;
  treeData: ParsedDOMTree;
  treeRenderProps: TreeRenderProps;
};

export type JsonPreviewProps = {
  copied: boolean;
  copyFormattedJson: () => void;
  formattedJSON: string;
  handleJsonResizeStart: (event: React.MouseEvent) => void;
  isJsonResizing: boolean;
  isLoading: boolean;
  jsonPreviewRef: React.RefObject<HTMLPreElement | null>;
  setShowDataPreview: React.Dispatch<React.SetStateAction<boolean>>;
  showDataPreview: boolean;
};
