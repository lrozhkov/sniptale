import type { MouseEvent as ReactMouseEvent } from 'react';
import { expect, it } from 'vitest';

import { createInspectorCommandParams } from '../../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import {
  buildTextAppearanceBackgroundCommand,
  buildTextAppearanceBackgroundOpacityCommand,
} from './appearance/background';
import { buildTextTypographyCommands } from './typography';

it('builds text background commands with preview and commit routing', () => {
  const params = createInspectorCommandParams();
  const backgroundCommand = buildTextAppearanceBackgroundCommand(params as never);
  const opacityCommand = buildTextAppearanceBackgroundOpacityCommand(params as never);
  const backgroundControl = (backgroundCommand.content as any).props.children.props;
  const opacityControl = (opacityCommand.content as any).props.children.props;

  backgroundControl.onChange('#445566');
  backgroundControl.onPreviewChange('#778899');
  backgroundControl.onPreviewReset('#99aabb');
  opacityControl.onCommitValue(40);

  expect(params.updateColor).toHaveBeenCalledTimes(1);
  expect(params.previewColor).toHaveBeenCalledTimes(2);
  expect(params.applyTextPatch).toHaveBeenCalledWith({ backgroundColor: '#445566' });
  expect(params.applyTextPatch).toHaveBeenCalledWith({ backgroundColor: '#778899' });
  expect(params.applyTextPatch).toHaveBeenCalledWith({ backgroundColor: '#99aabb' });
  expect(params.previewTextPatch).toHaveBeenCalledWith({ backgroundOpacity: 0.4 });
  expect(params.commitPendingSelectionSettings).toHaveBeenCalledOnce();
});

it('builds text typography commands with font, size, and inline-style actions', () => {
  const params = createInspectorCommandParams();
  const commands = buildTextTypographyCommands(params as never);
  const fontCommand = commands[0]!;
  const fontSizeCommand = commands[1]!;
  const boldCommand = commands.find((command) => command.id === 'text-bold');
  const italicCommand = commands.find((command) => command.id === 'text-italic');

  (fontCommand.content as any).props.children.props.onChange('mono');
  (fontSizeCommand.content as any).props.children.props.onChange('24');
  boldCommand?.onMouseDown?.({
    preventDefault: () => undefined,
  } as ReactMouseEvent<HTMLButtonElement>);
  boldCommand?.onClick?.();
  italicCommand?.onClick?.();

  expect(params.applyTextPatch).toHaveBeenCalledWith({ fontFamily: 'mono' });
  expect(params.applyTextPatch).toHaveBeenCalledWith({ fontSize: 24 });
  expect(params.applyTextStyle).toHaveBeenCalledWith('bold');
  expect(params.applyTextStyle).toHaveBeenCalledWith('italic');
});
