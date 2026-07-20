import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_EDITOR_WORKSPACE_DEFAULTS } from '../persistence/workspace';
import { useEditorStore } from './useEditorStore';

afterEach(() => {
  useEditorStore.setState({ viewportPreviewAutomationBlockedInSession: false });
  useEditorStore.getState().updateWorkspaceDefaults(DEFAULT_EDITOR_WORKSPACE_DEFAULTS);
  useEditorStore.getState().resetDocumentState();
});

function registerDocumentDefaultsTests() {
  it('starts and resets on the file inspector', () => {
    expect(useEditorStore.getState().inspector).toBe('file');

    useEditorStore.getState().setInspector('tool');
    expect(useEditorStore.getState().inspector).toBe('tool');

    useEditorStore.getState().resetDocumentState();
    expect(useEditorStore.getState().inspector).toBe('file');
  });

  it('syncs the active tool without forcing the inspector back to tool mode', () => {
    useEditorStore.getState().setInspector('layer-effects');

    useEditorStore.getState().syncActiveTool('select');

    expect(useEditorStore.getState().activeTool).toBe('select');
    expect(useEditorStore.getState().inspector).toBe('layer-effects');
  });

  it('hydrates workspace defaults without overwriting edited current-page color', () => {
    useEditorStore.getState().updateWorkspaceDefaults(DEFAULT_EDITOR_WORKSPACE_DEFAULTS);
    useEditorStore.getState().resetDocumentState();

    useEditorStore.getState().hydrateWorkspaceDefaults({ backgroundColor: '#111111' });
    expect(useEditorStore.getState().workspaceDefaults).toEqual({ backgroundColor: '#111111' });
    expect(useEditorStore.getState().workspace.backgroundColor).toBe('#111111');

    useEditorStore.getState().updateWorkspace({ backgroundColor: '#222222' });
    useEditorStore.getState().hydrateWorkspaceDefaults({ backgroundColor: '#333333' });

    expect(useEditorStore.getState().workspaceDefaults).toEqual({ backgroundColor: '#333333' });
    expect(useEditorStore.getState().workspace.backgroundColor).toBe('#222222');

    useEditorStore.getState().resetDocumentState();

    expect(useEditorStore.getState().workspace.backgroundColor).toBe('#333333');
    expect(useEditorStore.getState().workspaceBackgroundEdited).toBe(false);
  });
}

function registerViewportPreviewTests() {
  it('blocks viewport preview auto-open for the rest of the tab session after manual disable', () => {
    useEditorStore.getState().setViewportPreviewOpenFromUser(false);

    expect(useEditorStore.getState().viewportPreviewOpen).toBe(false);
    expect(useEditorStore.getState().viewportPreviewAutomationBlockedInSession).toBe(true);

    useEditorStore.getState().setViewportPreviewOpenFromUser(true);

    expect(useEditorStore.getState().viewportPreviewOpen).toBe(true);
    expect(useEditorStore.getState().viewportPreviewAutomationBlockedInSession).toBe(true);

    useEditorStore.getState().setViewportPreviewOpenFromSync(false);
    expect(useEditorStore.getState().viewportPreviewOpen).toBe(false);
    expect(useEditorStore.getState().viewportPreviewAutomationBlockedInSession).toBe(true);
  });

  it('also latches the session block after manual enable', () => {
    useEditorStore.getState().setViewportPreviewOpenFromUser(true);

    expect(useEditorStore.getState().viewportPreviewOpen).toBe(true);
    expect(useEditorStore.getState().viewportPreviewAutomationBlockedInSession).toBe(true);
  });

  it('keeps the manual preview state across document resets for the same tab session', () => {
    useEditorStore.getState().setViewportPreviewOpenFromUser(false);

    useEditorStore.getState().resetDocumentState();

    expect(useEditorStore.getState().viewportPreviewOpen).toBe(false);
    expect(useEditorStore.getState().viewportPreviewAutomationBlockedInSession).toBe(true);

    useEditorStore.getState().setViewportPreviewOpenFromUser(true);

    useEditorStore.getState().resetDocumentState();

    expect(useEditorStore.getState().viewportPreviewOpen).toBe(true);
    expect(useEditorStore.getState().viewportPreviewAutomationBlockedInSession).toBe(true);
  });

  it('still resets preview closed when there is no manual override in the tab session', () => {
    useEditorStore.getState().setViewportPreviewOpenFromSync(true);
    useEditorStore.getState().resetDocumentState();

    expect(useEditorStore.getState().viewportPreviewOpen).toBe(false);
    expect(useEditorStore.getState().viewportPreviewAutomationBlockedInSession).toBe(false);
  });
}

describe('useEditorStore document defaults', () => {
  registerDocumentDefaultsTests();
  registerViewportPreviewTests();
});
