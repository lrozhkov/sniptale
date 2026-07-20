import { expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';

const mocks = vi.hoisted(() => ({
  baseCommandsMock: vi.fn(() => [{ id: 'base-command', title: 'Base', trigger: 'B' }]),
  detailCommandsMock: vi.fn(() => [{ id: 'detail-command', title: 'Detail', trigger: 'D' }]),
  surfaceCommandsMock: vi.fn(() => [{ id: 'surface-command', title: 'Surface', trigger: 'S' }]),
}));

vi.mock('../../scene', () => ({
  EditorInspectorFrameModeButtons: ({
    ariaLabel,
    onChange,
    options,
  }: {
    ariaLabel?: string;
    onChange: (value: string) => void;
    options: Array<{ label: string; value: string }>;
  }) => (
    <div data-aria-label={ariaLabel}>
      {options.map((option) => (
        <button key={option.value} type="button" onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  ),
}));
vi.mock('./browser-frame-base-sections', () => ({
  buildBrowserFrameBaseCommands: mocks.baseCommandsMock,
}));
vi.mock('./browser-frame-details', () => ({
  buildBrowserFrameDetailCommands: mocks.detailCommandsMock,
}));
vi.mock('./frame-surface-details', () => ({
  buildFrameSurfaceCommands: mocks.surfaceCommandsMock,
}));

import { buildBrowserFrameCompactCommands, buildFrameCompactCommands } from './frame-sections';

it('prepends frame mode commands before surface commands and updates frame draft', () => {
  const params = createInspectorCommandParams();
  const commands = buildFrameCompactCommands(params as never);

  expect(commands.map((command) => command.id)).toEqual([
    'frame-layout-mode',
    'frame-background-mode',
    'surface-command',
  ]);
  expect(((commands[0]?.content as any).props.children as any).props.ariaLabel).toBe('Размещение');
  expect(((commands[1]?.content as any).props.children as any).props.ariaLabel).toBe('Тип фона');

  const layoutOnChange = ((commands[0]?.content as any).props.children as any).props.onChange;
  const backgroundOnChange = ((commands[1]?.content as any).props.children as any).props.onChange;

  layoutOnChange('solid');
  backgroundOnChange('color');

  expect(params.setFrameDraft).toHaveBeenCalledTimes(2);
  expect(mocks.surfaceCommandsMock).toHaveBeenCalledWith(params);
});

it('switches the frame placement note for fit-image layout mode', () => {
  const params = {
    ...createInspectorCommandParams(),
    frameDraft: {
      ...createInspectorCommandParams().frameDraft,
      layoutMode: 'fit-image',
    },
  };

  const commands = buildFrameCompactCommands(params as never);

  expect((commands[0]?.content as any).props.note).toBe(
    translate('editor.compact.scenePlacementFitNote')
  );
});

it('always appends browser-frame details after the base insert/update controls', () => {
  const params = createInspectorCommandParams();

  expect(buildBrowserFrameCompactCommands(params as never)).toEqual([
    { id: 'base-command', title: 'Base', trigger: 'B' },
    { id: 'detail-command', title: 'Detail', trigger: 'D' },
  ]);
  expect(mocks.baseCommandsMock).toHaveBeenCalled();
  expect(mocks.detailCommandsMock).toHaveBeenCalledWith(params);
});
