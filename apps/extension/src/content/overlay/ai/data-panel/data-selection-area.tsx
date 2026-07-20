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
  spoilerSummary: string;
  toggleExpandAll: () => void;
  toggleSelectAll: () => void;
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
      isAnySelected={props.isAnySelected}
      isDataResizing={props.isDataResizing}
      isDataSpoilerOpen={props.isDataSpoilerOpen}
      isLoading={props.isLoading}
      spoilerSummary={props.spoilerSummary}
      toggleExpandAll={props.toggleExpandAll}
      toggleSelectAll={props.toggleSelectAll}
      treeData={props.treeData}
      treeRenderProps={props.treeRenderProps}
    />
  );
}
