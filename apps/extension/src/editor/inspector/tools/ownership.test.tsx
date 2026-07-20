// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   tool ownership scenarios intentionally cover multiple rendered tool branches in one deterministic suite */

import React from 'react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import { translate } from '../../../platform/i18n';
import {
  cleanupDom,
  createControllerMock,
  renderWithController,
} from '../../../../../../tooling/test/harness/editor/ownership/helpers';
import {
  createInspectorCommandParams,
  createToolsPanelProps,
} from '../../../../../../tooling/test/harness/editor/ownership/fixtures';

function getRequiredValue<T>(value: T | null | undefined, label: string): T {
  expect(value, label).toBeDefined();
  return value as T;
}

function getWrappedControlProps(panel: React.ReactElement<any>) {
  const control = panel.props.children as React.ReactElement<any>;
  return (control.type as any)(control.props).props;
}

function getToolColorControlProps(section: React.ReactElement<any>) {
  if (section.props.onChange) {
    return section.props;
  }
  return getWrappedControlProps((section.type as any)(section.props));
}

function getControlProps(section: React.ReactElement<any>) {
  return (section.props.children as React.ReactElement<any> | undefined)?.props ?? section.props;
}

function getSectionChildren(element: React.ReactElement<any>) {
  return React.Children.toArray(element.props.children) as React.ReactElement<any>[];
}

function getStepGroupSections(group: React.ReactElement<any>) {
  return React.Children.toArray(group.props.children.props.children) as React.ReactElement<any>[];
}

describe('inspector tool panels', () => {
  it('renders tools panel branches for crop, step, and resizable selections', async () => {
    const controller = createControllerMock();
    const { EditorInspectorToolsPanel } = await import('.');
    const { renderSelectionActionsSectionWithController } = await import('./sections');

    renderWithController(
      <EditorInspectorToolsPanel {...(createToolsPanelProps() as any)} />,
      controller
    );
    await act(async () => {
      Array.from(document.querySelectorAll('button'))
        .filter((button) =>
          [translate('editor.compact.apply'), translate('editor.compact.cancel')].some((label) =>
            button.textContent?.includes(label)
          )
        )
        .forEach((button) => button.click());
    });
    expect(controller.applyCropSelection).toHaveBeenCalledOnce();
    expect(controller.cancelCropMode).toHaveBeenCalledOnce();

    cleanupDom();
    const stepProps = createToolsPanelProps({ highlightedTool: 'step' }) as any;
    renderWithController(<EditorInspectorToolsPanel {...stepProps} />, controller);
    const stepInput = document.querySelector<HTMLInputElement>(
      `input[aria-label="${translate('editor.compact.stepValue')}"]`
    );
    expect(stepInput).not.toBeNull();
    await act(async () => {
      stepInput!.value = '12';
      stepInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(stepProps.applyStepPatch).toBeDefined();

    cleanupDom();
    renderWithController(
      <EditorInspectorToolsPanel {...(createToolsPanelProps({ cropReady: false }) as any)} />,
      controller
    );
    expect(
      Array.from(document.querySelectorAll('button')).find((button) =>
        button.textContent?.includes(translate('editor.compact.apply'))
      )?.disabled
    ).toBe(true);

    cleanupDom();
    renderWithController(
      <EditorInspectorToolsPanel
        {...(createToolsPanelProps({ highlightedTool: 'select' }) as any)}
      />,
      controller
    );
    await act(async () => {
      Array.from(document.querySelectorAll('button'))
        .filter((button) => button.textContent?.includes(translate('editor.compact.apply')))
        .forEach((button) => button.click());
    });
    expect(controller.resizeLayer).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(translate('editor.compact.chooseToolOrObject'));

    cleanupDom();
    renderWithController(
      <EditorInspectorToolsPanel
        {...(createToolsPanelProps({
          highlightedTool: 'select',
          selection: {
            ...createInspectorCommandParams().selection,
            hasSelection: false,
          },
        }) as any)}
      />,
      controller
    );
    expect(document.body.textContent).not.toContain(translate('editor.compact.selection'));

    expect(
      renderSelectionActionsSectionWithController({
        canDeleteSelection: true,
        panelButtonClassName: 'panel',
        selection: {
          ...createInspectorCommandParams().selection,
          hasSelection: false,
        } as never,
        selectionDeleteIcon: <span>delete</span>,
        selectionDuplicateIcon: <span>duplicate</span>,
      } as never)
    ).toBeNull();

    cleanupDom();
    renderWithController(
      <>{renderSelectionActionsSectionWithController({} as never)}</>,
      controller
    );
    expect(document.querySelectorAll('button')).toHaveLength(0);
  }, 15_000);

  it('covers direct frame and tool-section orchestration branches', async () => {
    const controller = createControllerMock();
    const { renderEditorInspectorFrameSection } = await import('../content-sections/size');
    const { renderCropControlsSection, renderStepControlsSection } = await import('./step-crop');
    const { EditorInspectorToolsPanel } = await import('.');

    const applyGradientPreset = vi.fn();
    const clearBackgroundImage = vi.fn();
    const onApplyFrame = vi.fn();
    const onPickBackgroundImage = vi.fn();
    const setFrameDraft = vi.fn(
      (
        updater: (
          state: typeof DEFAULT_EDITOR_FRAME_SETTINGS
        ) => typeof DEFAULT_EDITOR_FRAME_SETTINGS
      ) => updater(DEFAULT_EDITOR_FRAME_SETTINGS)
    );
    const framePanel = renderEditorInspectorFrameSection({
      applyGradientPreset,
      backgroundPreviewStyle: {},
      clearBackgroundImage,
      frameBackgroundImageFitOptions: [{ label: 'Cover', value: 'cover' }],
      frameBackgroundModeOptions: [{ label: 'Color', value: 'color' }],
      frameBackgroundPalette: ['#ffffff'],
      frameDraft: DEFAULT_EDITOR_FRAME_SETTINGS,
      frameGradientPresets: [
        { angle: 90, from: '#111111', id: 'preset', label: 'Preset', to: '#ffffff' },
      ],
      frameLayoutModeOptions: [{ label: 'Expand', value: 'expand-canvas' }],
      framePaddingSummary: '12 / 12 / 12 / 12',
      onApplyFrame,
      onPickBackgroundImage,
      recentColors: ['#111111'],
      scenePresetHeader: null,
      setFrameDraft: setFrameDraft as never,
      toNumber: (value: string) => Number(value),
    }) as React.ReactElement<any>;

    framePanel.props.setLayoutMode('expand-canvas');
    framePanel.props.setBackgroundMode('color');
    framePanel.props.setFrameDraft((state: typeof DEFAULT_EDITOR_FRAME_SETTINGS) => ({
      ...state,
      paddingTop: 28,
    }));
    framePanel.props.applyGradientPreset({
      angle: 45,
      from: '#111111',
      id: 'alt',
      label: 'Alt',
      to: '#ffffff',
    });
    framePanel.props.previewFramePatch({ backgroundColor: '#f5f5f5' });
    framePanel.props.applyFramePatch({ backgroundColor: '#111111' });
    framePanel.props.onPickBackgroundImage();
    framePanel.props.onClearBackgroundImage();
    framePanel.props.onApplyFrame();

    expect(setFrameDraft).toHaveBeenCalled();
    expect(applyGradientPreset).toHaveBeenCalledOnce();
    expect(onPickBackgroundImage).toHaveBeenCalledOnce();
    expect(clearBackgroundImage).toHaveBeenCalledOnce();
    expect(onApplyFrame).toHaveBeenCalledOnce();

    const stepProps = createToolsPanelProps() as any;
    const stepSection = renderStepControlsSection(stepProps) as React.ReactElement<any>;
    const stepGroups = getSectionChildren(stepSection);
    const textSections = getStepGroupSections(stepGroups[0] as React.ReactElement<any>);
    const shapeSections = getStepGroupSections(stepGroups[1] as React.ReactElement<any>);
    getControlProps(getRequiredValue(textSections[0], 'step type panel')).onChange('letter');
    getWrappedControlProps(getRequiredValue(textSections[1], 'step value panel')).onChange({
      currentTarget: { value: '8' },
    });
    expect(stepGroups).toHaveLength(3);

    const letterStepProps = createToolsPanelProps({
      inspectorToolSettings: {
        ...createInspectorCommandParams().inspectorToolSettings,
        step: {
          ...createInspectorCommandParams().inspectorToolSettings.step,
          alphabet: 'latin',
          type: 'letter',
          value: 'A',
        },
      },
    }) as any;
    const letterStepSection = renderStepControlsSection(letterStepProps) as React.ReactElement<any>;
    const letterStepGroups = getSectionChildren(letterStepSection);
    const letterTextSections = getStepGroupSections(letterStepGroups[0] as React.ReactElement<any>);
    getControlProps(getRequiredValue(letterTextSections[2], 'step alphabet panel')).onChange(
      'cyrillic'
    );
    getControlProps(getRequiredValue(shapeSections[0], 'step size panel')).onPreviewValue(5);
    getToolColorControlProps(getRequiredValue(shapeSections[1], 'step color panel')).onChange(
      '#0f172a'
    );
    expect(stepProps.applyStepPatch).toHaveBeenCalled();

    const cropSection = renderCropControlsSection({
      controller: controller as never,
      cropReady: true,
      primaryPanelButtonClassName: 'primary',
      secondaryPanelButtonClassName: 'secondary',
    }) as React.ReactElement<any>;
    const cropButtons = (
      getRequiredValue(
        (cropSection.props.children as React.ReactElement<any>[])[1],
        'crop button row'
      ) as React.ReactElement<any>
    ).props.children as React.ReactElement<any>[];
    await act(async () => {
      getRequiredValue(cropButtons[0], 'apply crop button').props.onClick();
      getRequiredValue(cropButtons[1], 'cancel crop button').props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    renderCropControlsSection({
      controller: controller as never,
      cropReady: false,
      primaryPanelButtonClassName: 'primary',
      secondaryPanelButtonClassName: 'secondary',
    });

    expect(controller.applyCropSelection).toHaveBeenCalled();
    expect(controller.cancelCropMode).toHaveBeenCalled();

    cleanupDom();
    renderWithController(
      <>
        <EditorInspectorToolsPanel
          {...(createToolsPanelProps({ highlightedTool: 'rectangle' }) as any)}
        />
        <EditorInspectorToolsPanel
          {...(createToolsPanelProps({ highlightedTool: 'arrow' }) as any)}
        />
        <EditorInspectorToolsPanel
          {...(createToolsPanelProps({ highlightedTool: 'text' }) as any)}
        />
        <EditorInspectorToolsPanel
          {...(createToolsPanelProps({ highlightedTool: 'select' }) as any)}
        />
      </>,
      controller
    );
  });
});
