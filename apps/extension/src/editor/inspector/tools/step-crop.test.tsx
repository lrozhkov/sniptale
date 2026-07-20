import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { translate } from '../../../platform/i18n';
import { createToolsPanelProps } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { renderCropControlsSection, renderStepControlsSection } from './step-crop';

function createStepProps() {
  return createToolsPanelProps({
    applyStepPatch: vi.fn(),
    commitPendingSelectionSettings: vi.fn(),
    previewColor: vi.fn((setter: (value: string) => void, color: string) => setter(color)),
    updateColor: vi.fn((setter: (value: string) => void, color: string) => setter(color)),
  });
}

function getGroupSections(group: React.ReactElement<any>) {
  return React.Children.toArray(group.props.children.props.children) as React.ReactElement<any>[];
}

function getControlProps(section: React.ReactElement<any>) {
  return (section.props.children as React.ReactElement<any> | undefined)?.props ?? section.props;
}

it('routes segmented step type changes through the normalized patch helper', () => {
  const props = createStepProps();
  const element = renderStepControlsSection(props as never) as React.ReactElement<any>;
  const groups = React.Children.toArray(element.props.children) as React.ReactElement<any>[];
  const textSections = getGroupSections(groups[0] as React.ReactElement<any>);
  const typeSection = textSections[0] as React.ReactElement<any>;
  const valueSection = textSections[1] as React.ReactElement<any>;
  const valueInput = valueSection.props.children.type(
    valueSection.props.children.props
  ) as React.ReactElement<any>;

  typeSection.props.onChange('letter');
  valueInput.props.onChange({ currentTarget: { value: '2' } });
  valueInput.props.onValueCommit();

  expect((typeSection.type as { name?: string }).name).toBe('SelectField');
  expect(valueSection.props.children.type.name).toBe('StepValueInput');
  expect(groups.map((group) => group.props.label)).toEqual([
    translate('editor.compact.stepTextGroup'),
    translate('editor.compact.stepShapeGroup'),
    translate('editor.compact.stepStrokeGroup'),
  ]);
  expect(props.applyStepPatch).toHaveBeenCalledWith({ type: 'letter', value: 'А' });
  expect(props.previewStepPatch).toHaveBeenCalledWith({ value: '2' });
  expect(props.commitPendingSelectionSettings).toHaveBeenCalledOnce();
});

it('renders text, shape, and stroke controls for letter steps', () => {
  const props = createStepProps();
  props.inspectorToolSettings.step.type = 'letter';
  props.inspectorToolSettings.step.alphabet = 'latin';
  props.inspectorToolSettings.step.value = 'A';
  const element = renderStepControlsSection(props as never) as React.ReactElement<any>;
  const groups = React.Children.toArray(element.props.children) as React.ReactElement<any>[];
  const textSections = getGroupSections(groups[0] as React.ReactElement<any>);
  const shapeSections = getGroupSections(groups[1] as React.ReactElement<any>);
  const strokeSections = getGroupSections(groups[2] as React.ReactElement<any>);
  const alphabetSection = textSections[2] as React.ReactElement<any>;
  const textColorSection = textSections[3] as React.ReactElement<any>;
  const sizeSection = shapeSections[0] as React.ReactElement<any>;
  const shapeColorSection = shapeSections[1] as React.ReactElement<any>;
  const shapeOpacitySection = shapeSections[2] as React.ReactElement<any>;
  const strokeWidthSection = strokeSections[0] as React.ReactElement<any>;
  const strokeColorSection = strokeSections[1] as React.ReactElement<any>;
  const textColorControl = getControlProps(textColorSection);
  const shapeColorControl = getControlProps(shapeColorSection);
  const strokeColorControl = getControlProps(strokeColorSection);

  getControlProps(alphabetSection).onChange('cyrillic');
  getControlProps(sizeSection).onPreviewValue(20);
  expect(props.previewStepPatch).toHaveBeenNthCalledWith(1, { sizeLevel: 20 });
  getControlProps(sizeSection).onCommitValue(20);
  getControlProps(shapeOpacitySection).onPreviewValue(35);
  getControlProps(strokeWidthSection).onPreviewValue(0);
  textColorControl.onChange('#111111');
  shapeColorControl.onChange('#445566');
  strokeColorControl.onPreviewChange('#778899');

  expect(alphabetSection.props.label).toBe(translate('editor.compact.alphabet'));
  expect(textColorSection.props.label).toBe(translate('editor.compact.stepTextColor'));
  expect(shapeColorSection.props.label).toBe(translate('editor.compact.stepShapeColor'));
  expect(strokeColorSection.props.label).toBe(translate('editor.compact.stepStrokeColor'));
  expect(getControlProps(sizeSection).max).toBe(20);
  expect(props.applyStepPatch).toHaveBeenCalledWith({ alphabet: 'cyrillic', value: 'А' });
  expect(props.applyStepPatch).toHaveBeenCalledWith({ textColor: '#111111' });
  expect(props.applyStepPatch).toHaveBeenCalledWith({ color: '#445566' });
  expect(props.applyStepPatch).toHaveBeenCalledWith({ strokeColor: '#778899' });
  expect(props.previewStepPatch).toHaveBeenCalledWith({ opacity: 0.35 });
  expect(props.previewStepPatch).toHaveBeenCalledWith({ strokeWidth: 0 });
  expect(props.commitPendingSelectionSettings).toHaveBeenCalledOnce();
});

it('renders step controls inside the template parameter wrapper', () => {
  const props = createStepProps();
  props.toolPresetHeader = {
    activeView: 'parameters',
    saveDisabled: true,
    savePanel: null,
    templates: [],
    onOpenSavePanel: vi.fn(),
    onViewChange: vi.fn(),
  } as never;

  expect(renderToStaticMarkup(renderStepControlsSection(props as never))).toContain(
    'data-editor-template-save-trigger'
  );
});

describe('renderCropControlsSection', () => {
  it('routes apply and cancel actions and reflects crop readiness', async () => {
    const controller = {
      applyCropSelection: vi.fn(),
      cancelCropMode: vi.fn(),
    };
    const readyElement = renderCropControlsSection({
      controller,
      cropReady: true,
      primaryPanelButtonClassName: 'primary',
      secondaryPanelButtonClassName: 'secondary',
    }) as React.ReactElement<any>;
    const waitingElement = renderCropControlsSection({
      controller,
      cropReady: false,
      primaryPanelButtonClassName: 'primary',
      secondaryPanelButtonClassName: 'secondary',
    }) as React.ReactElement<any>;
    const readySections = React.Children.toArray(
      readyElement.props.children
    ) as React.ReactElement<any>[];
    const waitingSections = React.Children.toArray(
      waitingElement.props.children
    ) as React.ReactElement<any>[];
    const buttons = React.Children.toArray(
      readySections[1]?.props.children
    ) as React.ReactElement<any>[];
    const waitingButtons = React.Children.toArray(
      waitingSections[1]?.props.children
    ) as React.ReactElement<any>[];

    buttons[0]?.props.onClick();
    buttons[1]?.props.onClick();
    await Promise.resolve();
    await Promise.resolve();

    expect(readySections[0]?.props.value).toBe(translate('editor.compact.cropAreaReady'));
    expect(waitingSections[0]?.props.value).toBe(translate('editor.compact.cropAreaWaiting'));
    expect(waitingButtons[0]?.props.disabled).toBe(true);
    expect(controller.applyCropSelection).toHaveBeenCalledTimes(1);
    expect(controller.cancelCropMode).toHaveBeenCalledTimes(1);
  });
});
