import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import {
  PickerFooter,
  PickerHslFields,
  PickerManualColorField,
  PickerRgbFields,
  PickerToolbar,
  updatePlaneFromEvent,
} from './picker-sections';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function getChildren(element: React.ReactElement<any>) {
  return React.Children.toArray(element.props.children) as React.ReactElement<any>[];
}

function getFieldInputs(element: React.ReactElement<any>) {
  return getChildren((element.type as any)(element.props) as React.ReactElement<any>);
}

it('maps plane events into bounded plane colors', () => {
  const color = updatePlaneFromEvent(
    { clientX: 40, clientY: 20 } as PointerEvent,
    {
      getBoundingClientRect: () => ({ left: 10, top: 5, width: 50, height: 25 }),
    } as HTMLDivElement,
    180,
    ({ left, top }) => `#${left}-${top}`
  );

  expect(color).toBe('#30-15');
});

it('renders the toolbar and wires hue plus eyedropper handlers', () => {
  const onHueChange = vi.fn();
  const onEyedropperPick = vi.fn(async () => undefined);
  const onSelectTransparent = vi.fn();

  const toolbar = PickerToolbar({
    eyedropperAvailable: true,
    eyedropperPressed: true,
    handleEyedropperPick: onEyedropperPick,
    hue: 180,
    onHueChange,
    onSelectTransparent,
    resolvedColor: '#abcdef',
  }) as React.ReactElement<any>;
  const toolbarChildren = getChildren(toolbar);
  const markup = renderToStaticMarkup(toolbar);

  toolbarChildren[0]?.props.onClick();
  toolbarChildren[1]?.props.onChange({ target: { value: '90' } });
  toolbarChildren[2]?.props.handleEyedropperPick();

  expect(toolbarChildren[0]?.props.onClick).toBeTypeOf('function');
  expect(toolbarChildren[1]?.props.max).toBe(359);
  expect(toolbarChildren[1]?.props.className).toContain('sniptale-color-selector-hue-range');
  expect(onSelectTransparent).toHaveBeenCalledOnce();
  expect(onHueChange).toHaveBeenCalledWith('90');
  expect(onEyedropperPick).toHaveBeenCalledOnce();
  expect(markup).toContain('lucide-ban');
  expect(markup).toContain('width="18"');
  expect(markup).toContain('height="18"');
  expect(markup).toContain('aria-label="shared.ui.colorSelectorTransparent"');
  expect(markup).toContain('data-ui="shared.ui.color-selector.eyedropper"');
  expect(markup).toContain('h-9 w-9');
  expect(markup).toContain('active:translate-y-px');
});

it('omits the eyedropper when the runtime does not support it', () => {
  expect(
    renderToStaticMarkup(
      PickerToolbar({
        eyedropperAvailable: false,
        eyedropperPressed: false,
        handleEyedropperPick: async () => undefined,
        hue: 180,
        onHueChange: () => undefined,
        onSelectTransparent: () => undefined,
        resolvedColor: '#abcdef',
      })
    )
  ).not.toContain('shared.ui.colorSelectorEyedropper');
});

it('renders a clickable label-row overlay for the hex field without duplicate button text', () => {
  const onCycle = vi.fn();
  const field = PickerManualColorField({
    mode: 'hex',
    onChange: () => undefined,
    onCycle,
    value: '#abcdef',
  }) as React.ReactElement<any>;
  const markup = renderToStaticMarkup(field);

  expect(markup).toContain('data-ui="shared.ui.color-selector.mode-cycle"');
  expect(markup).toContain('shared.ui.colorSelectorHex');
  expect(markup).toContain('grid min-h-5 grid-cols-3');
  expect(markup).toContain('col-span-3');
  expect(markup).toContain('hover:bg-');
  expect(markup).toContain('text-[color:var(--sniptale-color-text-primary)]');
  expect(markup).toContain('caret-[color:var(--sniptale-color-accent)]');
});

it('renders the manual hex field and rgb fields with wired handlers', () => {
  const onHexChange = vi.fn();
  const onRedChange = vi.fn();
  const onGreenChange = vi.fn();
  const onBlueChange = vi.fn();
  const onCycle = vi.fn();

  const manualField = PickerManualColorField({
    mode: 'hex',
    onChange: onHexChange,
    onCycle,
    value: '#abcdef',
  }) as React.ReactElement<any>;
  const manualChildren = getChildren(manualField);
  manualChildren[0]?.props.onCycle();
  manualChildren[1]?.props.onChange('#112233');

  const fields = PickerRgbFields({
    blue: 30,
    green: 20,
    mode: 'rgb',
    onBlueChange,
    onCycle,
    onGreenChange,
    onRedChange,
    red: 10,
  }) as React.ReactElement<any>;
  const fieldItems = getChildren(fields);
  const inputs = getFieldInputs(fieldItems[1]!);
  fieldItems[0]?.props.onCycle();
  inputs[0]?.props.onChange('11');
  inputs[1]?.props.onChange('22');
  inputs[2]?.props.onChange('33');

  expect(onCycle).toHaveBeenCalledTimes(2);
  expect(onHexChange).toHaveBeenCalledWith('#112233');
  expect(onRedChange).toHaveBeenCalledWith('11');
  expect(onGreenChange).toHaveBeenCalledWith('22');
  expect(onBlueChange).toHaveBeenCalledWith('33');
});

it('renders the footer with quiet matte action styling', () => {
  const onApply = vi.fn();
  const onCancel = vi.fn();

  const footer = PickerFooter({
    onApply,
    onCancel,
  }) as React.ReactElement<any>;
  const footerButtons = getChildren(footer);

  footerButtons[0]?.props.onClick();
  footerButtons[1]?.props.onClick();

  expect(onCancel).toHaveBeenCalledOnce();
  expect(onApply).toHaveBeenCalledOnce();
  expect(footerButtons[0]?.props.className).toContain('text-xs font-medium');
  expect(footerButtons[0]?.props.className).toContain('bg-transparent');
  expect(footerButtons[1]?.props.className).toContain('text-xs font-medium');
});

it('renders HSL fields with the expected labels and handlers', () => {
  const onHueChange = vi.fn();
  const onSaturationChange = vi.fn();
  const onLightnessChange = vi.fn();
  const onCycle = vi.fn();

  const fields = PickerHslFields({
    hue: 180,
    lightness: 30,
    mode: 'hsl',
    onCycle,
    onHueChange,
    onLightnessChange,
    onSaturationChange,
    saturation: 20,
  }) as React.ReactElement<any>;
  const fieldItems = getChildren(fields);
  const inputs = getFieldInputs(fieldItems[1]!);

  fieldItems[0]?.props.onCycle();
  inputs[0]?.props.onChange('181');
  inputs[1]?.props.onChange('21');
  inputs[2]?.props.onChange('31');

  expect(renderToStaticMarkup(fields)).toContain('shared.ui.colorSelectorHue');
  expect(renderToStaticMarkup(fields)).toContain('shared.ui.colorSelectorSaturation');
  expect(renderToStaticMarkup(fields)).toContain('shared.ui.colorSelectorLightness');
  expect(onCycle).toHaveBeenCalledOnce();
  expect(onHueChange).toHaveBeenCalledWith('181');
  expect(onSaturationChange).toHaveBeenCalledWith('21');
  expect(onLightnessChange).toHaveBeenCalledWith('31');
});
