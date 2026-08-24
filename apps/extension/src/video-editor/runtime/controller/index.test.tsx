// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { useWorkspaceDialogsContext } from './composition/hooks';

it('rejects leaf context consumption outside the composition provider', () => {
  function DialogConsumer() {
    useWorkspaceDialogsContext();
    return null;
  }

  expect(() => renderToStaticMarkup(<DialogConsumer />)).toThrow(
    'Workspace dialogs context must be used inside VideoEditorCompositionProvider.'
  );
});
