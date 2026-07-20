import { describe, expect, it } from 'vitest';
import type { ToolCommandParams } from '../../../compact/tool-commands/types';
import { buildTextCompactCommands } from './';

function createTextCommandParams(): ToolCommandParams {
  return {
    applyTextPatch: () => undefined,
    applyTextStyle: () => undefined,
    fontOptions: [{ value: 'mono', label: 'Mono' }],
    inspectorToolSettings: {
      text: {
        backgroundColor: '#111111',
        backgroundOpacity: 1,
        textOpacity: 1,
        fontFamily: 'mono',
        fontSize: 24,
        fontWeight: 'bold',
        fontStyle: 'normal',
        layoutMode: 'fixed-width',
        underline: false,
        linethrough: false,
        textAlign: 'left',
        verticalAlign: 'top',
        textColor: '#222222',
        shadow: 0,
        shadowAngle: 90,
        shadowBlur: 12,
        shadowColor: '#222222',
        shadowDistance: 4,
        calloutFormat: 'bubble',
      },
    },
    commitPendingSelectionSettings: () => undefined,
    previewColor: () => undefined,
    previewTextPatch: () => undefined,
    recentColors: [],
    textCalloutFormatOptions: [{ value: 'bubble', label: 'Bubble' }],
    textColorPalette: [],
    toNumber: (value: string, fallback: number) => Number.parseInt(value, 10) || fallback,
    updateColor: () => undefined,
  } as unknown as ToolCommandParams;
}

describe('commands index facade', () => {
  it('re-exports the text command builder contract', () => {
    const commands = buildTextCompactCommands(createTextCommandParams());

    expect(commands.map((command) => command.id)).toEqual([
      'text-color',
      'text-opacity',
      'text-background',
      'text-background-opacity',
      'text-font',
      'text-font-size',
      'text-align',
      'text-vertical-align',
      'text-bold',
      'text-italic',
      'text-underline',
      'text-linethrough',
      'text-shadow',
    ]);
  });
});
