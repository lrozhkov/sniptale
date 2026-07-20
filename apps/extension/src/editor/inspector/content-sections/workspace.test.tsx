import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_WORKSPACE_SETTINGS } from '../../../features/editor/document/constants';

import { renderEditorInspectorContentWorkspaceSections } from './workspace';

vi.mock('../environment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../environment')>()),
  EditorInspectorGridPanel: (props: unknown) => (
    <div data-testid="grid-panel" {...(props as object)} />
  ),
  EditorInspectorMetaPanel: () => <div data-testid="meta-panel" />,
  EditorInspectorWorkspacePanel: (props: unknown) => (
    <div data-testid="workspace-panel" {...(props as object)} />
  ),
}));

function createProps() {
  return {
    clampGridSize: vi.fn((value: number) => value),
    gridPalette: ['#111111'],
    gridSizeMax: 96,
    gridSizeMin: 8,
    inspector: 'workspace',
    recentColors: ['#222222'],
    updateColor: vi.fn(),
    updateWorkspace: vi.fn(),
    workspace: { ...DEFAULT_EDITOR_WORKSPACE_SETTINGS },
    workspaceBackgroundPalette: ['#ffffff'],
    workspaceColorError: null,
    workspaceColorMatchesDefault: false,
    workspaceDefaultSavePending: false,
    applyWorkspaceColor: vi.fn(),
    saveWorkspaceColorAsDefault: vi.fn(),
  };
}

describe('inspector/content-sections/workspace', () => {
  it('renders the workspace panel and wires workspace color callbacks', () => {
    const props = createProps();
    const element = renderEditorInspectorContentWorkspaceSections(props);

    expect(isValidElement(element)).toBe(true);
    expect(element.props.workspaceBackgroundColor).toBe(
      DEFAULT_EDITOR_WORKSPACE_SETTINGS.backgroundColor
    );
    expect(element.props.workspaceColorMatchesDefault).toBe(false);
    expect(element.props.workspaceDefaultSavePending).toBe(false);

    element.props.previewWorkspaceColor('#aabbcc');
    element.props.applyWorkspaceColor('#abcdef');
    element.props.saveWorkspaceColorAsDefault();

    expect(props.updateWorkspace).toHaveBeenCalledWith({ backgroundColor: '#aabbcc' });
    expect(props.applyWorkspaceColor).toHaveBeenCalledWith('#abcdef');
    expect(props.saveWorkspaceColorAsDefault).toHaveBeenCalledOnce();
  });

  it('renders the grid panel and wires grid color callbacks', () => {
    const props = { ...createProps(), inspector: 'grid' };
    const element = renderEditorInspectorContentWorkspaceSections(props);

    expect(isValidElement(element)).toBe(true);
    expect(element.props.gridSize).toBe(DEFAULT_EDITOR_WORKSPACE_SETTINGS.gridSize);
    expect(element.props.magnetEnabled).toBeUndefined();

    element.props.applyGridColor('#444444');

    expect(props.updateColor).toHaveBeenCalledWith(expect.any(Function), '#444444');
  });

  it('falls back to the meta panel for non-workspace inspectors', () => {
    const element = renderEditorInspectorContentWorkspaceSections({
      ...createProps(),
      inspector: 'document',
    });

    expect(isValidElement(element)).toBe(true);
    expect(renderToStaticMarkup(element)).toContain('meta-panel');
  });
});
