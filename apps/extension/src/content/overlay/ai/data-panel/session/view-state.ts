import type React from 'react';
import type { TreeNodeState } from '../types';
import { getSummaryToneClass } from '../interactions/panel';

type DataPanelActions = {
  copyFormattedJson: () => void;
  handleDataResizeStart: (event: React.MouseEvent) => void;
  handleJsonResizeStart: (event: React.MouseEvent) => void;
  handleToggleSpoiler: () => void;
  toggleColumnExclusion: (tableId: string, column: string) => void;
  toggleExpandAll: () => void;
  toggleExpanded: (nodeId: string) => void;
  toggleSelectAll: () => void;
  toggleSelected: (nodeId: string) => void;
};

type DataPanelViewBaseState = {
  copied: boolean;
  dataContainerRef: React.RefObject<HTMLDivElement | null>;
  excludedColumns: Map<string, string[]>;
  isDataResizing: boolean;
  isDataSpoilerOpen: boolean;
  isJsonResizing: boolean;
  jsonPreviewRef: React.RefObject<HTMLPreElement | null>;
  setShowDataPreview: React.Dispatch<React.SetStateAction<boolean>>;
  showDataPreview: boolean;
  treeState: Map<string, TreeNodeState>;
};

type DataPanelViewDerivedState = {
  formattedJSON: string;
  isAnyExpanded: boolean;
  isAnySelected: boolean;
  selectedData: string;
  spoilerSummary: string;
};

export function buildAIModalDataPanelViewState(props: {
  actions: DataPanelActions;
  base: DataPanelViewBaseState;
  derived: DataPanelViewDerivedState;
}) {
  return {
    ...createAIModalDataPanelBaseView(props.base),
    ...createAIModalDataPanelDerivedView(props.derived),
    ...createAIModalDataPanelActions(props.actions, props.derived.spoilerSummary),
  };
}

function createAIModalDataPanelBaseView(base: DataPanelViewBaseState) {
  return {
    copied: base.copied,
    dataContainerRef: base.dataContainerRef,
    excludedColumns: base.excludedColumns,
    isDataResizing: base.isDataResizing,
    isDataSpoilerOpen: base.isDataSpoilerOpen,
    isJsonResizing: base.isJsonResizing,
    jsonPreviewRef: base.jsonPreviewRef,
    setShowDataPreview: base.setShowDataPreview,
    showDataPreview: base.showDataPreview,
    treeState: base.treeState,
  };
}

function createAIModalDataPanelDerivedView(derived: DataPanelViewDerivedState) {
  return {
    formattedJSON: derived.formattedJSON,
    isAnyExpanded: derived.isAnyExpanded,
    isAnySelected: derived.isAnySelected,
    selectedData: derived.selectedData,
    spoilerSummary: derived.spoilerSummary,
  };
}

function createAIModalDataPanelActions(actions: DataPanelActions, spoilerSummary: string) {
  return {
    copyFormattedJson: actions.copyFormattedJson,
    handleDataResizeStart: actions.handleDataResizeStart,
    handleJsonResizeStart: actions.handleJsonResizeStart,
    handleToggleSpoiler: actions.handleToggleSpoiler,
    toggleColumnExclusion: actions.toggleColumnExclusion,
    toggleExpandAll: actions.toggleExpandAll,
    toggleExpanded: actions.toggleExpanded,
    toggleSelectAll: actions.toggleSelectAll,
    toggleSelected: actions.toggleSelected,
    getSummaryToneClass: () => getSummaryToneClass(spoilerSummary),
  };
}
