import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { panelButtonClassName, PanelSection } from './shared';

it('reuses the shared scene panel shell and inline button chrome for environment owners', () => {
  const markup = renderToStaticMarkup(
    <PanelSection label="Environment" value="Workspace">
      <div>content</div>
    </PanelSection>
  );

  expect(markup).toContain('Environment');
  expect(markup).toContain('Workspace');
  expect(markup).toContain('rounded-[14px]');
  expect(panelButtonClassName).toContain('rounded-[12px]');
  expect(panelButtonClassName).toContain('border-none');
});
