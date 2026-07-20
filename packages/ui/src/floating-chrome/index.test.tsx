import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import {
  FloatingChromeDivider,
  FloatingChromePanel,
  FloatingChromeRoot,
  FloatingChromeToolbar,
  floatingChromeClassNames,
} from './index';

it('composes floating chrome primitives and skips empty class fragments', () => {
  expect(floatingChromeClassNames('a', false, null, undefined, 'b')).toBe('a b');

  const markup = renderToStaticMarkup(
    <FloatingChromeRoot className="root-extra">
      <FloatingChromeToolbar className="toolbar-extra">Toolbar</FloatingChromeToolbar>
      <FloatingChromePanel dataUi="custom.panel">Panel</FloatingChromePanel>
      <FloatingChromePanel className="panel-extra">Default panel</FloatingChromePanel>
      <FloatingChromeDivider />
      <FloatingChromeDivider vertical={false} className="divider-extra" />
    </FloatingChromeRoot>
  );

  expect(markup).toContain('shared.ui.floating-chrome.root');
  expect(markup).toContain('shared.ui.floating-chrome.toolbar');
  expect(markup).toContain('sniptale-toolbar-root');
  expect(markup).toContain('flex items-center');
  expect(markup).not.toContain('sniptale-glass-toolbar toolbar-extra');
  expect(markup).toContain('custom.panel');
  expect(markup).toContain('shared.ui.floating-chrome.panel');
  expect(markup).toContain('h-8 w-px');
  expect(markup).toContain('h-px w-full');
  expect(markup).toContain('divider-extra');
});
