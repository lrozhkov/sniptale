import type { useEditorController } from '../../application/controller-context';
import { buildEditorInspectorCompactCommandGroups } from '../compact/commands';
import type { EditorInspectorCompactCommandContext } from '../compact/command-types';
import { createEditorInspectorCompactCommandGroupsParams } from '../compact/params';

type EditorInspectorSidebarCompactController = Omit<
  EditorInspectorCompactCommandContext,
  'hasImage' | 'onCloseDocument'
>;

export function createEditorInspectorSidebarCompactContext(args: {
  controller: EditorInspectorSidebarCompactController;
  hasImage: boolean;
  onCloseDocument: () => void;
}): EditorInspectorCompactCommandContext {
  return {
    ...args.controller,
    hasImage: args.hasImage,
    onCloseDocument: args.onCloseDocument,
  };
}

export function buildEditorInspectorSidebarCompactCommandGroups(args: {
  controller: ReturnType<typeof useEditorController>;
  context: EditorInspectorCompactCommandContext;
}) {
  return buildEditorInspectorCompactCommandGroups({
    ...createEditorInspectorCompactCommandGroupsParams(args.context),
    controller: args.controller,
  });
}
