import type { ImageEditorController } from '../../controller';
import type { CompactCommand } from '.';
import { flattenEditorInspectorCompactCommandGroupsParams } from './params';
import { type BuildEditorInspectorCompactCommandGroupsParams } from './command-types';
import { buildInspectorCompactCommands } from './inspector';

export function buildEditorInspectorCompactCommandGroups({
  controller,
  ...params
}: BuildEditorInspectorCompactCommandGroupsParams & {
  controller: Pick<
    ImageEditorController,
    'applyCropSelection' | 'deleteSelection' | 'duplicateSelection' | 'insertTechnicalData'
  >;
}): CompactCommand[][] {
  const context = flattenEditorInspectorCompactCommandGroupsParams(params);
  const { showDocumentActions } = context;
  const compactCommandGroups: CompactCommand[][] = [];
  const fullParams = context;

  if (showDocumentActions) {
    compactCommandGroups.push(buildInspectorCompactCommands(fullParams, controller));
  }

  if (!showDocumentActions) {
    const inspectorCompactCommands = context.hasImage
      ? buildInspectorCompactCommands(fullParams, controller)
      : [];
    if (inspectorCompactCommands.length > 0) {
      compactCommandGroups.push(inspectorCompactCommands);
    }
  }

  return compactCommandGroups;
}
