import React from 'react';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { DataSelectionPreview } from './selection-preview';
import type { TreeRenderProps } from './tree-view';

export type DataSelectionAreaProps = {
  dataContainerRef: React.RefObject<HTMLDivElement | null>;
  getSummaryToneClass: () => string;
  handleDataResizeStart: (event: React.MouseEvent) => void;
  handleToggleSpoiler: () => void;
  isAnyExpanded: boolean;
  isAnySelected: boolean;
  isDataResizing: boolean;
  isDataSpoilerOpen: boolean;
  isLoading: boolean;
  isFilteredSelectionComplete: boolean;
  spoilerSummary: string;
  filterQuery: string;
  filteredTreeData: ParsedDOMTree;
  setFilterQuery: React.Dispatch<React.SetStateAction<string>>;
  setShowSelectedOnly: React.Dispatch<React.SetStateAction<boolean>>;
  showSelectedOnly: boolean;
  toggleExpandAll: () => void;
  toggleSelectAll: () => void;
  toggleSelectFiltered: () => void;
  treeData: ParsedDOMTree;
  treeRenderProps: TreeRenderProps;
};

export function DataSelectionArea(props: DataSelectionAreaProps) {
  return (
    <DataSelectionPreview
      dataContainerRef={props.dataContainerRef}
      getSummaryToneClass={props.getSummaryToneClass}
      handleDataResizeStart={props.handleDataResizeStart}
      handleToggleSpoiler={props.handleToggleSpoiler}
      isAnyExpanded={props.isAnyExpanded}
      isAnySelected={props.isFilteredSelectionComplete}
      isDataResizing={props.isDataResizing}
      isDataSpoilerOpen={props.isDataSpoilerOpen}
      isLoading={props.isLoading}
      spoilerSummary={props.spoilerSummary}
      filterQuery={props.filterQuery}
      setFilterQuery={props.setFilterQuery}
      setShowSelectedOnly={props.setShowSelectedOnly}
      showSelectedOnly={props.showSelectedOnly}
      toggleExpandAll={props.toggleExpandAll}
      toggleSelectAll={props.toggleSelectFiltered}
      treeData={props.filteredTreeData}
      treeRenderProps={props.treeRenderProps}
    />
  );
}
