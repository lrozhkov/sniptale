// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   compact command builder coverage stays consolidated to preserve one command-matrix assertion pass */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createInspectorCommandParams } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';

function getRequiredValue<T>(value: T | null | undefined, label: string): T {
  expect(value, label).toBeDefined();
  return value as T;
}

function getWrappedControlProps(panel: React.ReactElement<any>) {
  const control = panel.props.children as React.ReactElement<any>;
  return (control.type as any)(control.props).props;
}

function getCompactCommandControl(
  commands: Array<{ content?: React.ReactNode; id: string }>,
  id: string
) {
  const command = getRequiredValue(
    commands.find((item) => item.id === id),
    id
  );
  return ((command.content as any).props.children as React.ReactElement<any>).props;
}

function commitNumeric(control: { onCommitValue?: (value: number) => void }, value: number) {
  control.onCommitValue?.(value);
}

describe('editor compact command builders', () => {
  it('builds compact groups for document, workspace, selection, and crop flows', async () => {
    const { buildEditorInspectorCompactCommandGroups } = await import('./commands');
    const { createEditorInspectorCompactCommandGroupsParams } = await import('./params');
    const { buildInspectorCompactCommands, buildSelectionActionCommands } =
      await import('./inspector');
    const { buildGridCompactCommands, buildMetaCompactCommands, buildWorkspaceCompactCommands } =
      await import('./inspector/workspace-sections');
    const { buildToolCompactCommands } = await import('./tool-commands');
    const { buildCropCompactCommands, buildStepCompactCommands } =
      await import('../tools/tool-inspector/session-sections');

    const params = createInspectorCommandParams();
    const controller = {
      applyCropSelection: vi.fn(async () => undefined),
      deleteSelection: vi.fn(),
      duplicateSelection: vi.fn(async () => undefined),
      insertTechnicalData: vi.fn(),
    };

    expect(
      buildEditorInspectorCompactCommandGroups({
        ...createEditorInspectorCompactCommandGroupsParams({
          ...params,
          showDocumentActions: true,
        } as never),
        controller,
      } as never)
    ).toHaveLength(1);
    expect(
      buildEditorInspectorCompactCommandGroups({
        ...createEditorInspectorCompactCommandGroupsParams({
          ...params,
          hasImage: false,
          showDocumentActions: false,
        } as never),
        controller,
      } as never)
    ).toEqual([]);

    const workspaceCommands = buildWorkspaceCompactCommands({
      ...params,
      inspector: 'workspace',
    } as never);
    const gridCommands = buildGridCompactCommands({ ...params, inspector: 'grid' } as never);
    const activeWorkspaceCommands = buildWorkspaceCompactCommands({
      ...params,
      inspector: 'workspace',
      workspace: {
        ...params.workspace,
        backgroundColor: '#0f172a',
      },
    } as never);
    const enabledGridCommands = buildGridCompactCommands({
      ...params,
      inspector: 'grid',
      workspace: {
        ...params.workspace,
        gridEnabled: true,
        gridSnapEnabled: true,
        magnetEnabled: true,
      },
    } as never);
    const metaCommands = buildMetaCompactCommands(controller);
    const selectionCommands = buildSelectionActionCommands(params as never, controller);
    const stepCommands = buildStepCompactCommands(params as never);

    expect(buildInspectorCompactCommands(params as never, controller).length).toBeGreaterThan(0);
    expect(
      buildInspectorCompactCommands(
        { ...params, hasImage: false, inspector: 'meta' } as never,
        controller
      )
    ).toEqual([]);
    expect(
      buildInspectorCompactCommands({ ...params, inspector: 'file' } as never, controller).length
    ).toBeGreaterThan(0);
    expect(
      buildInspectorCompactCommands({ ...params, inspector: 'image-size' } as never, controller)
        .length
    ).toBeGreaterThan(0);
    expect(
      buildInspectorCompactCommands({ ...params, inspector: 'canvas-size' } as never, controller)
        .length
    ).toBeGreaterThan(0);
    expect(
      buildInspectorCompactCommands({ ...params, inspector: 'frame' } as never, controller).length
    ).toBeGreaterThan(0);
    expect(
      buildInspectorCompactCommands({ ...params, inspector: 'browser-frame' } as never, controller)
        .length
    ).toBeGreaterThan(0);
    expect(workspaceCommands).toHaveLength(2);
    expect(gridCommands).toHaveLength(5);
    expect(activeWorkspaceCommands[1]?.content).toBeTruthy();
    expect(enabledGridCommands[0]?.active).toBe(true);
    expect(enabledGridCommands[1]?.active).toBe(true);
    expect(metaCommands).toHaveLength(1);
    expect(metaCommands[0]?.id).toBe('meta-technical-data');
    expect(selectionCommands).toEqual([]);
    expect(
      buildSelectionActionCommands(
        {
          ...params,
          selection: {
            ...params.selection,
            hasSelection: false,
          },
        } as never,
        controller
      )
    ).toEqual([]);

    const workspacePresetContent = ((workspaceCommands[1]?.content as any).props.children as any)
      .props.children as React.ReactElement<any>[];
    const workspacePaletteButton = getRequiredValue(
      (workspacePresetContent[0]?.props.children as React.ReactElement<any>[])[0],
      'workspace palette button'
    );
    const workspaceDefaultAction = getRequiredValue(
      workspacePresetContent[1],
      'workspace default action'
    );
    workspacePaletteButton.props.onClick();
    workspaceDefaultAction.props.onSaveAsDefault();

    gridCommands[0]?.onClick?.();
    gridCommands[1]?.onClick?.();
    const gridColorControl = ((gridCommands[2]?.content as any).props.children as any).props;
    const gridSizeControl = ((gridCommands[3]?.content as any).props.children as any).props;
    const gridPaletteButton = getRequiredValue(
      (
        (gridCommands[4]?.content as any).props.children.props.children as React.ReactElement<any>[]
      )[0] as React.ReactElement<any>,
      'grid palette button'
    );
    gridPaletteButton.props.onClick();
    commitNumeric(gridSizeControl, 18);
    (gridColorControl.onChange as (value: string) => void)('#d1d5db');

    getWrappedControlProps(stepCommands[1]?.content as any as React.ReactElement<any>).onChange({
      currentTarget: { value: '42' },
    });
    ((stepCommands[0]?.content as any).props.children as React.ReactElement<any>).props.onChange(
      'letter'
    );
    commitNumeric(getCompactCommandControl(stepCommands, 'step-size'), 4);
    getCompactCommandControl(stepCommands, 'step-color').onChange('#d4d4d8');
    commitNumeric(getCompactCommandControl(stepCommands, 'step-stroke-width'), 3);

    expect(params.applyWorkspaceColor).toHaveBeenCalledWith('#ffffff');
    expect(params.saveWorkspaceColorAsDefault).toHaveBeenCalledTimes(1);
    expect(params.updateWorkspace).toHaveBeenCalledWith({ gridEnabled: true });
    expect(params.updateWorkspace).toHaveBeenCalledWith({ gridSnapEnabled: true });
    expect(params.updateWorkspace).toHaveBeenCalledWith({ gridSize: 18 });
    expect(params.updateWorkspace).toHaveBeenCalledWith({ gridColor: '#d1d5db' });
    expect(params.applyStepPatch).toHaveBeenCalled();
    expect(
      buildToolCompactCommands(
        { ...params, highlightedTool: 'crop', inspector: 'tool' } as never,
        controller
      )
    ).toHaveLength(2);
    expect(
      buildToolCompactCommands(
        {
          ...params,
          highlightedTool: 'select',
          inspector: 'tool',
          isResizableLayerSelection: true,
        } as never,
        controller
      )
    ).toEqual([]);
    expect(
      buildToolCompactCommands(
        { ...params, highlightedTool: 'step', inspector: 'tool' } as never,
        controller
      ).length
    ).toBeGreaterThan(0);
    expect(
      buildToolCompactCommands(
        { ...params, highlightedTool: 'pencil', inspector: 'tool' } as never,
        controller
      ).length
    ).toBeGreaterThan(0);
    expect(
      buildToolCompactCommands(
        { ...params, highlightedTool: 'rectangle', inspector: 'tool' } as never,
        controller
      ).length
    ).toBeGreaterThan(0);
    expect(
      buildToolCompactCommands(
        { ...params, highlightedTool: 'arrow', inspector: 'tool' } as never,
        controller
      ).length
    ).toBeGreaterThan(0);
    expect(
      buildToolCompactCommands(
        { ...params, highlightedTool: 'text', inspector: 'tool' } as never,
        controller
      ).length
    ).toBeGreaterThan(0);
    expect(buildToolCompactCommands({ ...params, inspector: 'meta' } as never, controller)).toEqual(
      []
    );
    expect(
      buildToolCompactCommands(
        { ...params, highlightedTool: 'select', inspector: 'tool' } as never,
        controller
      )
    ).toEqual([]);
    expect(buildCropCompactCommands(params as never, controller)).toHaveLength(2);
    expect(
      buildCropCompactCommands({ ...params, cropReady: false } as never, controller)[1]?.disabled
    ).toBe(true);
    expect(stepCommands).toHaveLength(9);
  });
});
