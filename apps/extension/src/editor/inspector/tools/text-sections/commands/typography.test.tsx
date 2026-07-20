import { describe, expect, it, vi } from 'vitest';
import type { ToolCommandParams } from '../../../compact/tool-commands/types';
import { buildTextTypographyCommands } from './typography';

function createTextCommandParams(
  overrides?: Partial<ToolCommandParams['inspectorToolSettings']['text']>
): ToolCommandParams {
  const applyTextPatch = vi.fn();
  const applyTextStyle = vi.fn();
  const previewTextPatch = vi.fn();

  return {
    applyTextPatch,
    applyTextStyle,
    fontOptions: [{ value: 'mono', label: 'Mono' }],
    inspectorToolSettings: {
      text: {
        backgroundColor: '#111111',
        fontFamily: 'mono',
        fontSize: 24,
        fontWeight: 'bold',
        fontStyle: 'italic',
        underline: true,
        linethrough: false,
        textColor: '#222222',
        textOpacity: 1,
        shadow: 0,
        shadowAngle: 90,
        shadowColor: '#222222',
        calloutFormat: 'plain',
        layoutMode: 'fixed-width',
        textAlign: 'left',
        verticalAlign: 'top',
        ...overrides,
      },
    },
    previewColor: () => undefined,
    previewTextPatch,
    recentColors: [],
    textCalloutFormatOptions: [{ value: 'plain', label: 'Text' }],
    toNumber: (value: string, fallback: number) => Number.parseInt(value, 10) || fallback,
    updateColor: () => undefined,
  } as unknown as ToolCommandParams;
}

function getCommandControl(
  commands: ReturnType<typeof buildTextTypographyCommands>,
  index: number
) {
  return (commands[index]?.content as { props: { children: unknown } }).props.children as {
    props: Record<string, unknown>;
    type: { name?: string };
  };
}

function registerCommandCatalogTest() {
  it('builds the font, size, and style commands', () => {
    const commands = buildTextTypographyCommands(createTextCommandParams());

    expect(commands.map((command) => command.id)).toEqual([
      'text-font',
      'text-font-size',
      'text-align',
      'text-vertical-align',
      'text-bold',
      'text-italic',
      'text-underline',
      'text-linethrough',
    ]);
    expect(commands[0]?.value).toBe('Mono');
    expect(commands[1]?.value).toBe('24px');
    expect(commands[2]?.value).toBe('left');
    expect(commands[3]?.value).toBe('top');
    expect(commands[4]?.active).toBe(true);
    expect(commands[5]?.active).toBe(true);
    expect(commands[6]?.active).toBe(true);
  });
}

function registerTypographyHandlerTest() {
  it('wires font, size, and style handlers through the returned commands', () => {
    const params = createTextCommandParams();
    const commands = buildTextTypographyCommands(params);

    const fontControl = getCommandControl(commands, 0);
    const fontSizeControl = getCommandControl(commands, 1);

    (fontControl.props['onChange'] as (value: string) => void)('sans');
    (fontSizeControl.props['onChange'] as (value: string) => void)('28');
    (commands[4]?.onClick as () => void)();

    expect(params.applyTextPatch).toHaveBeenCalledWith({ fontFamily: 'sans' });
    expect(params.applyTextPatch).toHaveBeenCalledWith({ fontSize: 28 });
    expect(params.applyTextStyle).toHaveBeenCalledWith('bold');
    expect(params.applyTextPatch).not.toHaveBeenCalledWith({ maxWidth: expect.any(Number) });
    expect(fontControl.type.name).toBe('SelectField');
    expect(fontSizeControl.type.name).toBe('SelectField');
  });
}

function registerLayoutHandlerTest() {
  it('wires alignment handlers through the returned commands', () => {
    const params = createTextCommandParams();
    const commands = buildTextTypographyCommands(params);

    const alignControl = getCommandControl(commands, 2);
    const verticalAlignControl = getCommandControl(commands, 3);

    (alignControl.props['onChange'] as (value: string) => void)('center');
    (verticalAlignControl.props['onChange'] as (value: string) => void)('bottom');

    expect(params.applyTextPatch).toHaveBeenCalledWith({ textAlign: 'center' });
    expect(params.applyTextPatch).toHaveBeenCalledWith({ verticalAlign: 'bottom' });
    expect(alignControl.props['columns']).toBe(3);
    expect(verticalAlignControl.props['columns']).toBe(3);
  });
}

function registerBoldToggleTest() {
  it('toggles bold state on when the command starts inactive', () => {
    const params = createTextCommandParams({ fontWeight: 'normal' });
    const commands = buildTextTypographyCommands(params);

    (commands[4]?.onClick as () => void)();

    expect(commands[4]?.active).toBe(false);
    expect(params.applyTextStyle).toHaveBeenCalledWith('bold');
  });
}

describe('buildTextTypographyCommands', () => {
  registerCommandCatalogTest();
  registerTypographyHandlerTest();
  registerLayoutHandlerTest();
  registerBoldToggleTest();
});
