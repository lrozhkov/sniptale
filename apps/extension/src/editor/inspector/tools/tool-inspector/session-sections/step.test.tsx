import { describe, expect, it } from 'vitest';
import type React from 'react';

import { buildStepCompactCommands } from './step';
import { createInspectorCommandParams } from '../../../../../../../../tooling/test/harness/editor/ownership/fixtures';

function getStepValueInputProps(command: ReturnType<typeof buildStepCompactCommands>[number]) {
  const input = (command.content as any).props.children as React.ReactElement<any>;
  return (input.type as any)(input.props).props;
}

function getCommand(
  commands: ReturnType<typeof buildStepCompactCommands>,
  id: string
): ReturnType<typeof buildStepCompactCommands>[number] {
  const command = commands.find((item) => item.id === id);

  if (!command) {
    throw new Error(`Missing command ${id}`);
  }

  return command;
}

function getCommandChild(commands: ReturnType<typeof buildStepCompactCommands>, id: string) {
  return (getCommand(commands, id).content as any).props.children as React.ReactElement<any>;
}

function registerNumberStepCommandTest() {
  it('builds number step commands without alphabet and wires normalized patch actions', () => {
    const params = createInspectorCommandParams();
    const commands = buildStepCompactCommands(params as never);
    const typeControl = (commands[0]?.content as any).props.children as React.ReactElement<any>;
    const typeComponent = typeControl.type as { name?: string };

    expect(commands.map((command) => command.id)).toEqual([
      'step-type',
      'step-value',
      'step-text-color',
      'step-size',
      'step-color',
      'step-opacity',
      'step-stroke-width',
      'step-stroke-color',
      'step-stroke-opacity',
    ]);
    expect(typeComponent.name).toBe('SelectField');

    typeControl.props.onChange('letter');
    getStepValueInputProps(commands[1] as never).onChange({ currentTarget: { value: '42x' } });
    getCommandChild(commands, 'step-size').props.onPreviewValue(20);
    getCommandChild(commands, 'step-opacity').props.onPreviewValue(45);
    getCommandChild(commands, 'step-stroke-width').props.onPreviewValue(6);
    getCommandChild(commands, 'step-stroke-opacity').props.onPreviewValue(65);

    expect(params.applyStepPatch).toHaveBeenCalledWith({ type: 'letter', value: 'А' });
    expect(params.previewStepPatch).toHaveBeenCalledWith({ value: '42' });
    expect(params.previewStepPatch).toHaveBeenCalledWith({ sizeLevel: 20 });
    expect(params.previewStepPatch).toHaveBeenCalledWith({ opacity: 0.45 });
    expect(params.previewStepPatch).toHaveBeenCalledWith({ strokeWidth: 6 });
    expect(params.previewStepPatch).toHaveBeenCalledWith({ strokeOpacity: 0.65 });
    expect(params.updateColor).toBeDefined();
  });
}

function registerLetterStepCommandTest() {
  it('shows alphabet for letter steps and normalizes alphabet changes', () => {
    const params = {
      ...createInspectorCommandParams(),
      inspectorToolSettings: {
        ...createInspectorCommandParams().inspectorToolSettings,
        step: {
          ...createInspectorCommandParams().inspectorToolSettings.step,
          alphabet: 'latin',
          type: 'letter',
          value: 'A',
        },
      },
    };
    const commands = buildStepCompactCommands(params as never);
    const typeControl = (commands[0]?.content as any).props.children as React.ReactElement<any>;
    const typeComponent = typeControl.type as { name?: string };

    expect(commands.map((command) => command.id)).toEqual([
      'step-type',
      'step-value',
      'step-alphabet',
      'step-text-color',
      'step-size',
      'step-color',
      'step-opacity',
      'step-stroke-width',
      'step-stroke-color',
      'step-stroke-opacity',
    ]);
    expect(typeComponent.name).toBe('SelectField');

    getStepValueInputProps(commands[1] as never).onChange({ currentTarget: { value: 'ж' } });
    ((commands[2]?.content as any).props.children as React.ReactElement<any>).props.onChange(
      'cyrillic'
    );

    expect(params.previewStepPatch).toHaveBeenCalledWith({ value: '' });
    expect(params.applyStepPatch).toHaveBeenCalledWith({ alphabet: 'cyrillic', value: 'А' });
  });
}

function registerManualStepCommandTest() {
  it('hides alphabet for manual steps and caps values at three characters', () => {
    const baseParams = createInspectorCommandParams();
    const params = {
      ...baseParams,
      inspectorToolSettings: {
        ...baseParams.inspectorToolSettings,
        step: {
          ...baseParams.inspectorToolSettings.step,
          type: 'manual',
          value: 'QA',
        },
      },
    };
    const commands = buildStepCompactCommands(params as never);

    expect(commands.map((command) => command.id)).toEqual([
      'step-type',
      'step-value',
      'step-text-color',
      'step-size',
      'step-color',
      'step-opacity',
      'step-stroke-width',
      'step-stroke-color',
      'step-stroke-opacity',
    ]);

    getStepValueInputProps(commands[1] as never).onChange({ currentTarget: { value: 'ABCD' } });

    expect(params.previewStepPatch).toHaveBeenCalledWith({ value: 'ABC' });
  });
}

describe('buildStepCompactCommands', () => {
  registerNumberStepCommandTest();
  registerLetterStepCommandTest();
  registerManualStepCommandTest();

  it('wires every step color command through the existing color handlers', () => {
    const params = createInspectorCommandParams();
    const commands = buildStepCompactCommands(params as never);

    for (const [id, patch] of [
      ['step-text-color', { textColor: '#111111' }],
      ['step-color', { color: '#222222' }],
      ['step-stroke-color', { strokeColor: '#333333' }],
    ] as const) {
      const color = Object.values(patch)[0] as string;
      getCommandChild(commands, id).props.onChange(color);
      expect(params.updateColor).toHaveBeenLastCalledWith(expect.any(Function), color);
      const [createPatch] = params.updateColor.mock.calls.at(-1) ?? [];
      createPatch?.(color);
      expect(params.applyStepPatch).toHaveBeenCalledWith(patch);
    }
  });
});
