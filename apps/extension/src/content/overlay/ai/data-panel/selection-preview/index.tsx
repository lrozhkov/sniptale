import type { DataSelectionPreviewProps } from '../preview/types';
import { DataSelectionPreviewBody } from './body';
import { DataSelectionPreviewHeader } from './header';

export function DataSelectionPreview({
  dataContainerRef,
  getSummaryToneClass,
  handleDataResizeStart,
  handleToggleSpoiler,
  isAnyExpanded,
  isAnySelected,
  isDataResizing,
  isDataSpoilerOpen,
  isLoading,
  spoilerSummary,
  toggleExpandAll,
  toggleSelectAll,
  treeData,
  treeRenderProps,
}: DataSelectionPreviewProps) {
  return (
    <div style={{ marginTop: '-4px' }}>
      <div className="sniptale-soft-divider" />
      <DataSelectionPreviewHeader
        getSummaryToneClass={getSummaryToneClass}
        handleToggleSpoiler={handleToggleSpoiler}
        isAnyExpanded={isAnyExpanded}
        isAnySelected={isAnySelected}
        isDataSpoilerOpen={isDataSpoilerOpen}
        isLoading={isLoading}
        spoilerSummary={spoilerSummary}
        toggleExpandAll={toggleExpandAll}
        toggleSelectAll={toggleSelectAll}
      />
      <div className={`sniptale-spoiler-content ${isDataSpoilerOpen ? 'open' : 'closed'}`}>
        {isDataSpoilerOpen ? (
          <DataSelectionPreviewBody
            dataContainerRef={dataContainerRef}
            handleDataResizeStart={handleDataResizeStart}
            isDataResizing={isDataResizing}
            treeData={treeData}
            treeRenderProps={treeRenderProps}
          />
        ) : null}
      </div>
    </div>
  );
}
