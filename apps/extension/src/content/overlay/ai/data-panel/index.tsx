import React from 'react';
import { useAIModalDataPanelState } from './session/controller';
import { AIModalDataPanelContent } from './content';
import type { AIModalDataPanelProps } from './types';

export const AIModalDataPanel: React.FC<AIModalDataPanelProps> = ({
  treeData,
  isLoading,
  onSelectedDataChange,
  selectedData,
}) => {
  const state = useAIModalDataPanelState({ onSelectedDataChange, selectedData, treeData });

  if (!treeData || treeData.structure.length === 0) {
    return null;
  }

  return (
    <AIModalDataPanelContent
      copied={state.copied}
      copyFormattedJson={state.copyFormattedJson}
      dataContainerRef={state.dataContainerRef}
      formattedJSON={state.formattedJSON}
      getSummaryToneClass={state.getSummaryToneClass}
      handleDataResizeStart={state.handleDataResizeStart}
      handleJsonResizeStart={state.handleJsonResizeStart}
      handleToggleSpoiler={state.handleToggleSpoiler}
      isAnyExpanded={state.isAnyExpanded}
      isAnySelected={state.isAnySelected}
      isDataResizing={state.isDataResizing}
      isDataSpoilerOpen={state.isDataSpoilerOpen}
      isJsonResizing={state.isJsonResizing}
      isLoading={isLoading}
      jsonPreviewRef={state.jsonPreviewRef}
      setShowDataPreview={state.setShowDataPreview}
      showDataPreview={state.showDataPreview}
      spoilerSummary={state.spoilerSummary}
      toggleExpandAll={state.toggleExpandAll}
      toggleSelectAll={state.toggleSelectAll}
      treeData={treeData}
      treeRenderProps={{
        excludedColumns: state.excludedColumns,
        toggleColumnExclusion: state.toggleColumnExclusion,
        toggleExpanded: state.toggleExpanded,
        toggleSelected: state.toggleSelected,
        treeState: state.treeState,
      }}
    />
  );
};
