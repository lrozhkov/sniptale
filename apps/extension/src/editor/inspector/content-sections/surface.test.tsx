/* eslint-disable max-lines-per-function -- surface routing proof keeps branch coverage together */
// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createContentProps } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';

const layerEffectsMock = vi.fn((_props?: unknown) => <div>effects</div>);
const browserFrameMock = vi.fn((_props?: unknown) => <div>browser</div>);
const toolsMock = vi.fn((_props?: unknown) => <div>tools</div>);
const workspaceMock = vi.fn((_props?: unknown) => <div>workspace</div>);
const textAlignOptions = [{ label: 'Left', value: 'left' }];
const textLayoutModeOptions = [{ label: 'Auto', value: 'auto' }];
const textVerticalAlignOptions = [{ label: 'Top', value: 'top' }];

vi.mock('../environment', () => ({
  EditorInspectorBrowserFramePanel: (props: unknown) => {
    browserFrameMock(props);
    return <div>browser</div>;
  },
}));

vi.mock('../layer-effects', () => ({
  EditorInspectorLayerEffectsPanel: (props: unknown) => {
    layerEffectsMock(props);
    return <div>effects</div>;
  },
}));

vi.mock('./tools', () => ({
  renderEditorInspectorContentToolsSections: (props: unknown) => {
    toolsMock(props);
    return <div>tools</div>;
  },
}));

vi.mock('./workspace', () => ({
  renderEditorInspectorContentWorkspaceSections: (props: unknown) => {
    workspaceMock(props);
    return <div>workspace</div>;
  },
}));

import { renderEditorInspectorContentSurfaceSections } from './surface';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

it('renders the layer-effects surface branch with effect props', () => {
  const props = createContentProps();

  render(
    renderEditorInspectorContentSurfaceSections({
      ...props,
      browserCanvasModeOptions: [],
      browserContentModeOptions: [],
      clampGridSize: (value: number) => value,
      fontOptions: [],
      frameBackgroundImageFitOptions: [],
      frameBackgroundModeOptions: [],
      frameGradientPresets: [],
      frameLayoutModeOptions: [],
      gridPalette: [],
      gridSizeMax: 64,
      gridSizeMin: 4,
      inspector: 'layer-effects',
      stepAlphabetOptions: [],
      stepTypeOptions: [],
      textAlignOptions,
      textCalloutFormatOptions: [],
      textLayoutModeOptions,
      updateLockedDraft: (state: { width: number; height: number }) => state,
      workspaceBackgroundPalette: [],
    } as never)
  );

  expect(layerEffectsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      applyLayerEffect: props.applyLayerEffect,
      layers: props.layers,
      onResizeLayer: props.onResizeLayer,
      setLayerSizeDraft: props.setLayerSizeDraft,
    })
  );
  expect(browserFrameMock).not.toHaveBeenCalled();
});

it('routes workspace-like inspectors away from the tools branch', () => {
  const props = createContentProps();

  render(
    renderEditorInspectorContentSurfaceSections({
      ...props,
      browserCanvasModeOptions: [],
      browserContentModeOptions: [],
      clampGridSize: (value: number) => value,
      fontOptions: [],
      frameBackgroundImageFitOptions: [],
      frameBackgroundModeOptions: [],
      frameGradientPresets: [],
      frameLayoutModeOptions: [],
      gridPalette: [],
      gridSizeMax: 64,
      gridSizeMin: 4,
      inspector: 'workspace',
      scenePresetHeader: { value: 'scene-default' } as never,
      stepAlphabetOptions: [],
      stepTypeOptions: [],
      textAlignOptions,
      toolPresetHeader: { value: 'tool-default' } as never,
      textCalloutFormatOptions: [],
      textLayoutModeOptions,
      textVerticalAlignOptions,
      updateLockedDraft: (state: { width: number; height: number }) => state,
      workspaceBackgroundPalette: [],
    } as never)
  );

  expect(workspaceMock).toHaveBeenCalledOnce();
  expect(workspaceMock).toHaveBeenCalledWith(
    expect.objectContaining({
      applyWorkspaceColor: props.applyWorkspaceColor,
      scenePresetHeader: { value: 'scene-default' },
      saveWorkspaceColorAsDefault: props.saveWorkspaceColorAsDefault,
      workspaceColorError: props.workspaceColorError,
      workspaceColorMatchesDefault: props.workspaceColorMatchesDefault,
      workspaceDefaultSavePending: props.workspaceDefaultSavePending,
    })
  );
  expect(toolsMock).not.toHaveBeenCalled();
});

it('routes browser-frame and tool inspectors through their dedicated content branches', () => {
  const props = createContentProps();

  render(
    renderEditorInspectorContentSurfaceSections({
      ...props,
      browserCanvasModeOptions: [],
      browserContentModeOptions: [],
      clampGridSize: (value: number) => value,
      fontOptions: [],
      frameBackgroundImageFitOptions: [],
      frameBackgroundModeOptions: [],
      frameGradientPresets: [],
      frameLayoutModeOptions: [],
      gridPalette: [],
      gridSizeMax: 64,
      gridSizeMin: 4,
      inspector: 'browser-frame',
      stepAlphabetOptions: [],
      stepTypeOptions: [],
      textCalloutFormatOptions: [],
      updateLockedDraft: (state: { width: number; height: number }) => state,
      workspaceBackgroundPalette: [],
    } as never)
  );
  expect(browserFrameMock).toHaveBeenCalledOnce();
  expect(browserFrameMock).toHaveBeenCalledWith(
    expect.objectContaining({
      browserFrame: props.browserFrame,
      insertOrUpdateBrowserFrame: props.insertOrUpdateBrowserFrame,
      syncBrowserFrame: props.syncBrowserFrame,
    })
  );

  render(
    renderEditorInspectorContentSurfaceSections({
      ...props,
      browserCanvasModeOptions: [],
      browserContentModeOptions: [],
      clampGridSize: (value: number) => value,
      fontOptions: [],
      frameBackgroundImageFitOptions: [],
      frameBackgroundModeOptions: [],
      frameGradientPresets: [],
      frameLayoutModeOptions: [],
      gridPalette: [],
      gridSizeMax: 64,
      gridSizeMin: 4,
      inspector: 'tool',
      scenePresetHeader: { value: 'scene-default' } as never,
      stepAlphabetOptions: [],
      stepTypeOptions: [],
      textAlignOptions,
      toolPresetHeader: { value: 'tool-default' } as never,
      textCalloutFormatOptions: [],
      textLayoutModeOptions,
      textVerticalAlignOptions,
      updateLockedDraft: (state: { width: number; height: number }) => state,
      workspaceBackgroundPalette: [],
    } as never)
  );
  expect(toolsMock).toHaveBeenCalledOnce();
  expect(toolsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      arrowHeadOptions: props.arrowHeadOptions,
      arrowVariantOptions: props.arrowVariantOptions,
      applyBlurPatch: props.applyBlurPatch,
      blurTypeOptions: props.blurTypeOptions,
      applyTextStyle: props.applyTextStyle,
      commitPendingSelectionSettings: props.commitPendingSelectionSettings,
      previewColor: props.previewColor,
      previewArrowPatch: props.previewArrowPatch,
      setPencilShapeCorrection: props.setPencilShapeCorrection,
      previewTextPatch: props.previewTextPatch,
      saveShapeAsHighlighterPreset: props.saveShapeAsHighlighterPreset,
      toolPresetHeader: { value: 'tool-default' },
      textAlignOptions,
      textCalloutFormatOptions: [],
      textLayoutModeOptions,
      textVerticalAlignOptions,
      updateColor: props.updateColor,
    })
  );
});
