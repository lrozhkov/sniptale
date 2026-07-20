import React from 'react';
import { EditorInspectorContent } from '../content';
import type { EditorInspectorContentController } from '../content/types';
import { EditorInspectorLayersPanel } from '../layers';
import {
  createEditorInspectorContentPanelProps,
  createEditorInspectorLayersPanelProps,
} from './helpers';

const scrollContainerClassName =
  'min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 lg:p-5 ' +
  '[scrollbar-gutter:stable_both-edges]';

export const EditorInspectorSidebarExpandedContent: React.FC<{
  hasImage: boolean;
  controller: Omit<EditorInspectorContentController, 'hasImage'>;
}> = ({ hasImage, controller }) => {
  const contentProps = createEditorInspectorContentPanelProps(hasImage, controller);
  const layersPanelProps = createEditorInspectorLayersPanelProps(controller);

  return (
    <div className="min-h-0 flex-1 overflow-hidden bg-[color:var(--sniptale-color-surface-panel)]">
      <div className="flex h-full flex-col">
        <div className={scrollContainerClassName}>
          <EditorInspectorContent {...contentProps} />
        </div>
        <EditorInspectorLayersPanel {...layersPanelProps} />
      </div>
    </div>
  );
};
