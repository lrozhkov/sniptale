import { expect, type Locator, type Page } from '@playwright/test';

/** Operates the accepted property through its measured segments or dropdown presentation. */
export async function chooseInspectorValue(
  page: Page,
  owner: Locator,
  label: string,
  value: string
) {
  await page.evaluate(() => document.fonts.ready);
  const group = owner.getByRole('group', { name: label, exact: true });
  if (await group.count()) {
    await group.getByRole('button', { name: value, exact: true }).click();
    return;
  }
  await owner.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('option', { name: value, exact: true }).click();
}

/** Shared rendered contract for the inspector's non-editing icon actions. */
export async function checkInspectorUtility(
  page: Page,
  button: Locator,
  radius: '4px' | '6px' = '6px',
  colorRole: 'muted' | 'secondary' = 'muted'
) {
  await page.mouse.move(0, 0);
  const muted = await button.evaluate((node, role) => {
    const probe = document.createElement('span');
    probe.style.color = `var(--sniptale-color-text-${role})`;
    node.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, colorRole);
  await expect(button).toHaveCSS('width', '28px');
  await expect(button).toHaveCSS('height', '28px');
  await expect(button).toHaveCSS('border-radius', radius);
  await expect(button).toHaveCSS('color', muted);
  await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await button.hover();
  await expect(button).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  await expect(button).not.toHaveCSS('color', muted);
  await page.mouse.down();
  await expect(button).toHaveCSS('transform', 'none');
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await page.keyboard.press('Tab');
  await button.focus();
  await expect(button).toHaveCSS('outline-style', 'solid');
  await expect(button).toHaveCSS('outline-width', '2px');
  await button.evaluate((node: HTMLButtonElement) => node.blur());
}

/** Labels may wrap at words, but a value must not squeeze them into letter columns. */
export async function checkInspectorLabels(panel: Locator) {
  const cramped = () =>
    panel
      .locator(
        '[data-ui="shared.ui.compact-inspector.select-field"] > span:first-child, ' +
          '[data-ui="shared.ui.compact-inspector.color-field"] > span:first-child, ' +
          '.guide-inspector-panel span:has(+ [data-ui="shared.ui.compact-select"]), ' +
          '[data-ui="shared.ui.compact-select"] > button .truncate'
      )
      .evaluateAll((labels) =>
        labels
          .filter((label) => {
            if (!label.getClientRects().length) return false;
            const style = getComputedStyle(label);
            const context = document.createElement('canvas').getContext('2d')!;
            context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            const longestWord = Math.max(
              ...(label.textContent ?? '')
                .split(/\s+/)
                .map((word) => context.measureText(word).width)
            );
            return label.getBoundingClientRect().width + 1 < longestWord;
          })
          .map((label) => label.textContent)
      );
  await expect.poll(cramped).toEqual([]);
}

/** Verifies bundled glyphs on the control's real text nodes, including native editor shadow DOM. */
export async function checkInspectorPaintedFont(page: Page, target: Locator, kind: string) {
  await target.scrollIntoViewIfNeeded();
  await target.evaluate(
    (node, value) => node.setAttribute('data-inspector-audit-font', value),
    kind
  );
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: `[data-inspector-audit-font="${kind}"]`,
    });
    let { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
    if (kind === 'input' || fonts.length === 0) {
      const { node } = await session.send('DOM.describeNode', { nodeId, depth: -1, pierce: true });
      const textElements = (current: typeof node): number[] => {
        const ownsText =
          current.nodeType === 1 &&
          current.children?.some(
            (child) => child.nodeType === 3 && child.nodeValue.trim().length > 0
          );
        return [
          ...(ownsText ? [current.backendNodeId] : []),
          ...(current.children ?? []).flatMap(textElements),
          ...(current.shadowRoots ?? []).flatMap(textElements),
        ];
      };
      const backendNodeIds =
        kind === 'input'
          ? (node.shadowRoots ?? [])
              .filter((shadow) => shadow.shadowRootType === 'user-agent')
              .flatMap(textElements)
          : textElements(node);
      expect(
        backendNodeIds,
        'The inspected control must contain actual painted text'
      ).not.toHaveLength(0);
      const { nodeIds } = await session.send('DOM.pushNodesByBackendIdsToFrontend', {
        backendNodeIds,
      });
      expect(nodeIds.every((id) => id > 0)).toBe(true);
      const results = await Promise.all(
        nodeIds.map((id) => session.send('CSS.getPlatformFontsForNode', { nodeId: id }))
      );
      fonts = results.flatMap((result) => result.fonts);
    }
    const expectedFamily = kind === 'input' ? 'Golos Text VF' : 'Golos UI VF';
    expect(
      fonts.some(
        (font) => font.isCustomFont && font.familyName === expectedFamily && font.glyphCount > 0
      ),
      `${kind}: ${JSON.stringify(fonts)}`
    ).toBe(true);
  } finally {
    await session.detach();
    await target.evaluate((node) => node.removeAttribute('data-inspector-audit-font'));
  }
}

/** Verifies visible parameter controls have names and fit their owning rows. */
export async function checkInspectorParameterRows(panel: Locator) {
  const fields = panel
    .locator('.sniptale-parameter-row')
    .locator(
      'input:not([type="hidden"]), textarea, [role="switch"], [role="slider"], ' +
        '[data-ui="shared.ui.compact-select"] > button, [data-ui="shared.ui.compact-inspector.segmented-row"]'
    );
  const observations = await fields.evaluateAll((nodes) =>
    nodes
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => {
        const row = node.closest('.sniptale-parameter-row')!;
        const bounds = node.getBoundingClientRect();
        const parent = row.getBoundingClientRect();
        const ids = node.getAttribute('aria-labelledby')?.split(/\s+/u) ?? [];
        const labels =
          node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
            ? [...(node.labels ?? [])].map((label) => label.textContent ?? '').join(' ')
            : '';
        return {
          name:
            node.getAttribute('aria-label') ||
            ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ') ||
            labels,
          owner: row.getAttribute('data-ui'),
          left: bounds.left - parent.left,
          right: parent.right - bounds.right,
        };
      })
  );
  for (const field of observations) {
    expect(field.name.trim(), JSON.stringify(field)).not.toBe('');
    expect(field.left, JSON.stringify(field)).toBeGreaterThanOrEqual(-1);
    expect(field.right, JSON.stringify(field)).toBeGreaterThanOrEqual(-1);
  }
}
