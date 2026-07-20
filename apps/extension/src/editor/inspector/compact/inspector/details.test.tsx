// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { buildBrowserFrameDetailCommands } from './browser-frame-details';
import { buildDimensionCommands } from './dimension-command';
import {
  buildCanvasSizeCompactCommands,
  buildFileCompactCommands,
  buildImageSizeCompactCommands,
} from './document-sections';
import { buildFrameSurfaceCommands } from './frame-surface-details';
import {
  buildGridCompactCommands,
  buildMetaCompactCommands,
  buildSelectionActionCommands,
  buildWorkspaceCompactCommands,
} from './workspace-sections';

function renderDimensionCommandContent(content: React.ReactNode) {
  const container = document.createElement('div');
  const root = createRoot(container);

  act(() => {
    root.render(content);
  });

  return { container, root };
}

function interactWithDimensionCommand(args: {
  commands: ReturnType<typeof buildDimensionCommands>;
  container: HTMLDivElement;
}) {
  const widthInput = args.container.querySelector('input') as HTMLInputElement | null;
  const lockButton = args.container.querySelector('button') as HTMLButtonElement | null;
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

  act(() => {
    descriptor?.set?.call(widthInput, '640');
    widthInput?.dispatchEvent(new Event('input', { bubbles: true }));
    widthInput?.dispatchEvent(new Event('change', { bubbles: true }));
    widthInput?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    lockButton?.click();
    args.commands[1]?.onClick?.();
  });
}

it('builds browser-frame detail commands with semantic icons and update handlers', async () => {
  const params = createInspectorCommandParams();
  const commands = buildBrowserFrameDetailCommands(params as never);

  expect(commands.map((command) => command.icon)).toEqual(['browser', 'text', 'link']);

  ((commands[1]?.content as any).props.children as any).props.onChange({
    currentTarget: { value: 'Sniptale title' },
  });
  ((commands[2]?.content as any).props.children as any).props.onChange({
    currentTarget: { value: 'https://sniptale.dev' },
  });

  await Promise.resolve();
  await Promise.resolve();

  expect(params.syncBrowserFrame).toHaveBeenCalledWith({ title: 'Sniptale title' });
  expect(params.syncBrowserFrame).toHaveBeenCalledWith({ url: 'https://sniptale.dev' });
});

it('builds dimension commands and routes size, lock, and apply actions', () => {
  const setDraft = vi.fn((value: React.SetStateAction<{ width: number; height: number }>) =>
    typeof value === 'function' ? value({ width: 1280, height: 720 }) : value
  );
  const setLocked = vi.fn((value: React.SetStateAction<boolean>) =>
    typeof value === 'function' ? value(true) : value
  );
  const onApply = vi.fn();
  const updateLockedDraft = vi.fn((state) => state);
  const commands = buildDimensionCommands({
    applyTitle: 'Apply size',
    aspectRatio: 16 / 9,
    label: 'Canvas size',
    locked: true,
    onApply,
    setDraft,
    setLocked,
    sizeDraft: { width: 1280, height: 720 },
    sizeText: '1280 x 720',
    triggerId: 'canvas-size',
    updateLockedDraft,
  });
  const { container, root } = renderDimensionCommandContent(commands[0]?.content);
  interactWithDimensionCommand({ commands, container });

  act(() => {
    root.unmount();
  });
  container.remove();

  expect(commands[0]?.icon).toBe('size');
  expect(commands).toHaveLength(2);
  expect(setDraft).toHaveBeenCalledTimes(1);
  expect(setLocked).toHaveBeenCalledTimes(1);
  expect(onApply).toHaveBeenCalledTimes(1);
});

it('builds image and canvas size compact commands through document sections', () => {
  const params = createInspectorCommandParams();

  const imageCommands = buildImageSizeCompactCommands(params as never);
  const canvasCommands = buildCanvasSizeCompactCommands(params as never);

  imageCommands[1]?.onClick?.();
  canvasCommands[1]?.onClick?.();

  expect(imageCommands.map((command) => command.id)).toEqual(['image-size', 'image-size-apply']);
  expect(canvasCommands.map((command) => command.id)).toEqual(['canvas-size', 'canvas-size-apply']);
  expect(params.onResizeImage).toHaveBeenCalledWith(1280, 720);
  expect(params.onResizeCanvas).toHaveBeenCalledWith(1280, 720);
});

it('maps file compact commands from document action groups', () => {
  const params = createInspectorCommandParams();
  const commands = buildFileCompactCommands(params as never);
  const actionCommand = commands.find((command) => command.onClick !== undefined);
  const contentCommand = commands.find((command) => command.content !== undefined);

  actionCommand?.onClick?.();

  expect(commands.length).toBeGreaterThan(0);
  expect(actionCommand).toBeDefined();
  expect(contentCommand).toBeDefined();
});

it('builds frame-surface commands with explicit icons and routes background actions', () => {
  const params = createInspectorCommandParams();
  const commands = buildFrameSurfaceCommands(params as never);
  const backgroundEditorProps = (
    (commands[0]?.content as any).props.children.props.children[1] as any
  ).props;
  const paddingFieldsProps = ((commands[1]?.content as any).props.children as any).props;

  expect(commands.map((command) => command.icon)).toEqual(['color', 'size', undefined]);

  (backgroundEditorProps.applyGradientPreset as (preset: unknown) => void)({ angle: 180 });
  (backgroundEditorProps.previewFramePatch as (patch: unknown) => void)({
    backgroundMode: 'gradient',
  });
  (backgroundEditorProps.applyFramePatch as (patch: unknown) => void)({ padding: 24 });
  (backgroundEditorProps.onPickBackgroundImage as () => void)();
  (backgroundEditorProps.onClearBackgroundImage as () => void)();
  (paddingFieldsProps.setFrameDraft as typeof params.setFrameDraft)(
    (state: typeof params.frameDraft) => ({
      ...state,
      paddingTop: 24,
    })
  );
  commands[2]?.onClick?.();

  expect(params.applyGradientPreset).toHaveBeenCalledWith({ angle: 180 });
  expect(params.setFrameDraft).toHaveBeenCalledTimes(3);
  expect(params.onPickBackgroundImage).toHaveBeenCalledTimes(1);
  expect(params.clearBackgroundImage).toHaveBeenCalledTimes(1);
  expect(params.onApplyFrame).toHaveBeenCalledTimes(1);
});

it('builds workspace color commands with a separate save-default action', () => {
  const baseParams = createInspectorCommandParams();
  const params = {
    ...baseParams,
    workspace: {
      ...baseParams.workspace,
      backgroundColor: '#ffffff',
    },
    workspaceBackgroundPalette: ['#ffffff', '#000000'],
  };
  const workspaceCommands = buildWorkspaceCompactCommands(params as never);
  const workspaceColorContent = ((workspaceCommands[0]?.content as any).props.children as any).props
    .children as any[];
  const workspacePresetContent = ((workspaceCommands[1]?.content as any).props.children as any)
    .props.children as any[];
  const workspaceControl = workspaceColorContent[0]?.props;
  const workspaceColorDefaultAction = workspaceColorContent[1]?.props;
  const workspacePaletteButtons = workspacePresetContent[0]?.props.children as any[];
  const workspacePresetDefaultAction = workspacePresetContent[1]?.props;

  expect(workspaceCommands.map((command) => command.id)).toEqual([
    'workspace-background',
    'workspace-presets',
  ]);
  expect(workspaceControl.onPreviewChange).toEqual(expect.any(Function));

  workspaceColorDefaultAction.onSaveAsDefault();
  workspacePaletteButtons[0]?.props.onClick();
  workspacePaletteButtons[1]?.props.onClick();
  (workspaceControl.onPreviewChange as (value: string) => void)('#223344');
  (workspaceControl.onPreviewReset as (value: string) => void)('#112233');
  (workspaceControl.onChange as (value: string) => void)('#112233');
  workspacePresetDefaultAction.onSaveAsDefault();

  expect(params.saveWorkspaceColorAsDefault).toHaveBeenCalledTimes(2);
  expect(params.applyWorkspaceColor).toHaveBeenCalledWith('#ffffff');
  expect(params.applyWorkspaceColor).toHaveBeenCalledWith('#000000');
  expect(params.applyWorkspaceColor).toHaveBeenCalledWith('#112233');
  expect(params.updateWorkspace).toHaveBeenCalledWith({ backgroundColor: '#223344' });
  expect(params.updateWorkspace).toHaveBeenCalledWith({ backgroundColor: '#112233' });
});

it('builds grid commands with commit-only color controls', () => {
  const params = createInspectorCommandParams();
  const gridCommands = buildGridCompactCommands(params as never);
  const activeGridCommands = buildGridCompactCommands({
    ...params,
    workspace: {
      ...params.workspace,
      gridEnabled: true,
      gridSnapEnabled: true,
    },
  } as never);
  const gridControl = ((gridCommands[2]?.content as any).props.children as any).props;
  const gridSizeControl = ((gridCommands[3]?.content as any).props.children as any).props;
  const gridPaletteButtons = ((gridCommands[4]?.content as any).props.children.props.children ??
    []) as any[];

  expect(gridCommands.map((command) => command.id)).toEqual([
    'grid-toggle',
    'grid-snap-toggle',
    'grid-color',
    'grid-size',
    'grid-presets',
  ]);
  expect(gridControl.onPreviewChange).toEqual(expect.any(Function));

  gridCommands[0]?.onClick?.();
  gridCommands[1]?.onClick?.();
  activeGridCommands[0]?.onClick?.();
  activeGridCommands[1]?.onClick?.();
  gridPaletteButtons[0]?.props.onClick();
  (gridControl.onPreviewChange as (value: string) => void)('#112244');
  (gridControl.onPreviewReset as (value: string) => void)('#112233');
  gridSizeControl.onPreviewValue(18);
  (gridControl.onChange as (value: string) => void)('#445566');

  expect(params.updateWorkspace).toHaveBeenCalledWith({ gridEnabled: true });
  expect(params.updateWorkspace).toHaveBeenCalledWith({ gridSnapEnabled: true });
  expect(params.updateWorkspace).toHaveBeenCalledWith({ gridEnabled: false });
  expect(params.updateWorkspace).toHaveBeenCalledWith({ gridSnapEnabled: false });
  expect(params.updateWorkspace).toHaveBeenCalledWith({ gridColor: '#112244' });
  expect(params.updateWorkspace).toHaveBeenCalledWith({ gridColor: '#112233' });
  expect(params.updateWorkspace).toHaveBeenCalledWith({ gridSize: 18 });
  expect(params.updateColor).toHaveBeenCalledTimes(2);
});

it('builds meta compact commands and leaves selection actions empty', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const insertTechnicalData = vi.fn();
  const container = document.createElement('div');
  const root: Root = createRoot(container);
  const commands = buildMetaCompactCommands({ insertTechnicalData });

  expect(commands.map((command) => command.id)).toEqual(['meta-technical-data']);

  act(() => {
    root.render(commands[0]?.content as React.ReactNode);
  });

  const checkboxes = Array.from(
    container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
  );
  const addButton = Array.from(container.querySelectorAll('button')).find((button) =>
    button.hasAttribute('disabled')
  );

  expect(checkboxes).toHaveLength(3);
  expect(container.textContent).not.toContain('editor.compact.technicalDataDescription');
  expect(addButton?.hasAttribute('disabled')).toBe(true);

  act(() => {
    checkboxes[2]?.click();
    checkboxes[0]?.click();
  });

  expect(addButton?.hasAttribute('disabled')).toBe(false);

  act(() => {
    addButton?.click();
  });

  expect(insertTechnicalData).toHaveBeenCalledWith(['url', 'browser'], 'column');
  expect(buildSelectionActionCommands({} as never, {} as never)).toEqual([]);

  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});
