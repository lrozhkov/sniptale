import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ToolCommandParams } from '../../../compact/tool-commands/types';
import { buildTextCompactCommands } from './build';

function createTextCommandParams(): ToolCommandParams {
  return {
    applyTextPatch: () => undefined,
    applyTextStyle: () => undefined,
    fontOptions: [],
    inspectorToolSettings: {
      text: {
        backgroundColor: '#111111',
        backgroundOpacity: 1,
        textOpacity: 1,
        fontFamily: 'sans',
        fontSize: 20,
        fontWeight: 'normal',
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

describe('buildTextCompactCommands', () => {
  it('keeps the appearance commands before the typography commands', () => {
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

  it('renders the text shadow trigger from the active shadow settings', () => {
    const params = createTextCommandParams();
    params.inspectorToolSettings.text.shadow = 35;
    params.inspectorToolSettings.text.shadowColor = '#ff00aa';

    const command = buildTextCompactCommands(params).find(({ id }) => id === 'text-shadow');

    expect(renderToStaticMarkup(<>{command?.trigger}</>)).toContain('#ff00aa');
    expect(renderToStaticMarkup(<>{command?.content}</>)).toContain('input');
  });

  it('renders a muted shadow trigger while text shadow is disabled', () => {
    const command = buildTextCompactCommands(createTextCommandParams()).find(
      ({ id }) => id === 'text-shadow'
    );
    const markup = renderToStaticMarkup(<>{command?.trigger}</>);

    expect(markup).toContain('--editor-tabler-color-icon-opacity:0.65');
    expect(markup).toContain('#222222');
  });
});
