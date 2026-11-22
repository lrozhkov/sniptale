import type { ForwardedRef, ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';
import { TextField } from '../../chrome/ui';
import type { TextFieldProps } from '../../../ui/compact-inspector-controls';

export function readStepValueControlProps(input: ReactElement): TextFieldProps {
  const field = TextField as typeof TextField & {
    render(props: TextFieldProps, ref: ForwardedRef<HTMLInputElement>): ReactElement;
  };
  const render = vi.spyOn(field, 'render');
  try {
    renderToStaticMarkup(input);
    const props = render.mock.calls[0]?.[0];
    if (!props) throw new Error('Step value input did not render a text field.');
    return props;
  } finally {
    render.mockRestore();
  }
}
