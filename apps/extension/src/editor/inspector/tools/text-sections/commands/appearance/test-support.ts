import { vi } from 'vitest';

import type { ToolCommandParams } from '../../../../compact/tool-commands/types';
import type { buildTextAppearanceCommands } from './build';

type TextCommandParamsOverrides = Omit<Partial<ToolCommandParams>, 'inspectorToolSettings'> & {
  inspectorToolSettings?: Omit<Partial<ToolCommandParams['inspectorToolSettings']>, 'text'> & {
    text?: Partial<ToolCommandParams['inspectorToolSettings']['text']>;
  };
};

export function createTextCommandParams(overrides?: TextCommandParamsOverrides): ToolCommandParams {
  const applyTextPatch = vi.fn();
  const applyTextStyle = vi.fn();
  const previewColor = vi.fn();
  const previewTextPatch = vi.fn();
  const updateColor = vi.fn();
  const { inspectorToolSettings, ...restOverrides } = overrides ?? {};
  const textSettings = {
    backgroundColor: '#111111',
    backgroundOpacity: 1,
    textOpacity: 1,
    fontFamily: 'sans',
    fontSize: 20,
    fontWeight: 'normal',
    fontStyle: 'normal',
    underline: false,
    linethrough: false,
    textColor: '#222222',
    shadow: 0,
    shadowAngle: 90,
    shadowColor: '#222222',
    calloutFormat: 'plain',
    ...inspectorToolSettings?.text,
  };

  return {
    applyTextPatch,
    applyTextStyle,
    fontOptions: [],
    previewColor,
    previewTextPatch,
    recentColors: [],
    toNumber: (value: string, fallback: number) => Number.parseInt(value, 10) || fallback,
    updateColor,
    ...restOverrides,
    inspectorToolSettings: {
      ...inspectorToolSettings,
      text: textSettings,
    },
  } as unknown as ToolCommandParams;
}

export function getTextAppearanceCommandControl(
  commands: ReturnType<typeof buildTextAppearanceCommands>,
  index: number
) {
  return (commands[index]?.content as { props: { children: unknown } }).props.children as {
    props: Record<string, unknown>;
  };
}
