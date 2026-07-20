import { translate } from '../../../platform/i18n';
import { patchEditorWorkspaceDefaults } from '../../persistence/workspace';
import { isRecordableRecentColor } from './colors';
import type { SidebarActionArgs } from './types';

export function createWorkspaceColorApplyAction(args: {
  rememberRecentColor: (color: string) => Promise<void>;
  setWorkspaceColorError: (message: string | null) => void;
  updateWorkspace: SidebarActionArgs['updateWorkspace'];
}) {
  return async (color: string): Promise<void> => {
    args.setWorkspaceColorError(null);
    args.updateWorkspace({ backgroundColor: color });

    if (isRecordableRecentColor(color)) {
      void args.rememberRecentColor(color);
    }
  };
}

export function createWorkspaceDefaultSaveAction(args: {
  setWorkspaceColorError: (message: string | null) => void;
  setWorkspaceDefaultSavePending: (pending: boolean) => void;
  updateWorkspaceDefaults: SidebarActionArgs['updateWorkspaceDefaults'];
  workspaceBackgroundColor: string;
  workspaceDefaultColor: string;
}) {
  return async (): Promise<void> => {
    if (args.workspaceBackgroundColor.toLowerCase() === args.workspaceDefaultColor.toLowerCase()) {
      return;
    }

    args.setWorkspaceColorError(null);
    args.setWorkspaceDefaultSavePending(true);

    try {
      const defaults = await patchEditorWorkspaceDefaults({
        backgroundColor: args.workspaceBackgroundColor,
      });
      args.updateWorkspaceDefaults(defaults);
    } catch {
      args.setWorkspaceColorError(translate('editor.compact.workspaceDefaultSaveFailed'));
    } finally {
      args.setWorkspaceDefaultSavePending(false);
    }
  };
}

export function createWorkspaceColorActionForSidebar(
  args: SidebarActionArgs,
  rememberRecentColor: (color: string) => Promise<void>
) {
  return createWorkspaceColorApplyAction({
    rememberRecentColor,
    setWorkspaceColorError: args.setWorkspaceColorError,
    updateWorkspace: args.updateWorkspace,
  });
}

export function createWorkspaceDefaultSaveActionForSidebar(args: SidebarActionArgs) {
  return createWorkspaceDefaultSaveAction({
    setWorkspaceColorError: args.setWorkspaceColorError,
    setWorkspaceDefaultSavePending: args.setWorkspaceDefaultSavePending,
    updateWorkspaceDefaults: args.updateWorkspaceDefaults,
    workspaceBackgroundColor: args.workspace.backgroundColor,
    workspaceDefaultColor: args.workspaceDefaultColor,
  });
}
