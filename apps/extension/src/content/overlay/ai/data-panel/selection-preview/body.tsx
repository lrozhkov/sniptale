import type React from 'react';
import type { DataSelectionPreviewProps } from '../preview/types';
import { TreeSection } from '../tree-view';

type DataSelectionPreviewBodyProps = Pick<
  DataSelectionPreviewProps,
  'dataContainerRef' | 'handleDataResizeStart' | 'isDataResizing' | 'treeData' | 'treeRenderProps'
>;

export function DataSelectionPreviewBody({
  dataContainerRef,
  handleDataResizeStart,
  isDataResizing,
  treeData,
  treeRenderProps,
}: DataSelectionPreviewBodyProps) {
  return (
    <div className="sniptale-spoiler-content open">
      <div style={{ position: 'relative' }}>
        <div
          ref={dataContainerRef as React.Ref<HTMLDivElement>}
          className="sniptale-data-container sniptale-modal-scroll"
        >
          {treeData.structure.map((section) => (
            <TreeSection key={section.id} section={section} treeRenderProps={treeRenderProps} />
          ))}
        </div>
        <div
          className={`sniptale-resizer ${isDataResizing ? 'active' : ''}`}
          onMouseDown={handleDataResizeStart}
        />
      </div>
    </div>
  );
}
