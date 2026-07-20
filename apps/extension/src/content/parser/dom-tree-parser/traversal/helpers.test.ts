// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  shouldRejectTreeWalkerClassList,
  shouldRejectTreeWalkerContext,
  shouldRejectTreeWalkerTag,
  shouldRejectVirtualIframeSubtree,
  shouldSkipActionPanel,
} from './helpers';

function runTagAndClassSuite() {
  it('rejects parser-irrelevant tags and extension chrome classes', () => {
    const element = document.createElement('div');
    element.className = 'sniptale-overlay';
    const nonExtension = document.createElement('div');
    nonExtension.className = 'app-shell';

    expect(shouldRejectTreeWalkerTag('SCRIPT')).toBe(true);
    expect(shouldRejectTreeWalkerTag('META')).toBe(true);
    expect(shouldRejectTreeWalkerTag('DIV')).toBe(false);
    expect(shouldRejectTreeWalkerClassList(element.classList)).toBe(true);
    expect(shouldRejectTreeWalkerClassList(nonExtension.classList)).toBe(false);
    expect(shouldRejectTreeWalkerClassList(null)).toBe(false);
  });
}

function runVirtualIframeSuite() {
  it('keeps dynamic-fields and mvs virtual iframes but rejects rich text ones', () => {
    const dynamicFields = document.createElement('div');
    dynamicFields.setAttribute('data-virtual-iframe', 'true');
    dynamicFields.setAttribute('data-application-code', 'dynamicFields');

    const richText = document.createElement('div');
    richText.setAttribute('data-virtual-iframe', 'true');
    richText.setAttribute('data-iframe-src', '/editor/richText');
    richText.id = 'rtf-editor-1';

    const ordinary = document.createElement('div');
    ordinary.setAttribute('data-virtual-iframe', 'false');

    expect(shouldRejectVirtualIframeSubtree(dynamicFields)).toBe(false);
    const mvs = dynamicFields.cloneNode() as HTMLDivElement;
    mvs.setAttribute('data-application-code', 'mvs');
    expect(shouldRejectVirtualIframeSubtree(mvs)).toBe(false);
    expect(shouldRejectVirtualIframeSubtree(richText)).toBe(true);
    expect(shouldRejectVirtualIframeSubtree(ordinary)).toBe(false);
  });
}

function runContextSuite() {
  it('rejects toolbars, skips attrWide descendants, and skips action panels', () => {
    const toolbarChild = document.createElement('button');
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.append(toolbarChild);

    const attrWide = document.createElement('td');
    attrWide.className = 'attrWide';
    const nested = document.createElement('span');
    attrWide.append(nested);

    const actionPanel = document.createElement('div');
    actionPanel.id = 'actionsForceEnabled-panel';
    const actionPanelWithTitle = document.createElement('div');
    actionPanelWithTitle.className = 'GAQEVERBM';
    const title = document.createElement('div');
    title.id = 'gwt-debug-title';
    actionPanelWithTitle.append(title);

    expect(shouldRejectTreeWalkerContext(toolbarChild)).toBe(NodeFilter.FILTER_REJECT);
    expect(shouldRejectTreeWalkerContext(nested)).toBe(NodeFilter.FILTER_SKIP);
    expect(shouldSkipActionPanel(actionPanel, actionPanel.classList, actionPanel.id)).toBe(true);
    expect(
      shouldSkipActionPanel(
        actionPanelWithTitle,
        actionPanelWithTitle.classList,
        actionPanelWithTitle.id
      )
    ).toBe(true);
  });
}

describe('dom-tree traversal helpers', () => {
  runTagAndClassSuite();
  runVirtualIframeSuite();
  runContextSuite();
});
