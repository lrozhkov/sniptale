// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { createInspectorCommandParams } from '../../../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { buildTextAppearanceColorCommand } from './color';

vi.mock('../../../../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../chrome/ui')>()),
  ColorField: (props: {
    onChange: (color: string) => void;
    onPreviewChange: (color: string) => void;
    onPreviewReset: (color: string) => void;
    value: string;
  }) => (
    <button
      type="button"
      data-ui="mock.color-control"
      onClick={() => {
        props.onChange('#abcdef');
        props.onPreviewChange('#fedcba');
        props.onPreviewReset('#112233');
      }}
    >
      {props.value}
    </button>
  ),
}));

it('builds text color command with preview and apply color handlers', () => {
  const params = createInspectorCommandParams();
  params.inspectorToolSettings.text.textColor = '#123456';
  const command = buildTextAppearanceColorCommand(params as never);
  const markup = renderToStaticMarkup(
    <>
      {command.trigger}
      {command.content}
    </>
  );

  expect(command.id).toBe('text-color');
  expect(command.value).toBe('#123456');
  expect(markup).toContain('#123456');

  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<>{command.content}</>));
  act(() => container.querySelector<HTMLButtonElement>('[data-ui="mock.color-control"]')?.click());

  expect(params.updateColor).toHaveBeenCalledWith(expect.any(Function), '#abcdef');
  expect(params.previewColor).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
});
