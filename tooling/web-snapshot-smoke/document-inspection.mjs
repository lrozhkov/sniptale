export async function inspectDocument(pageOrFrame) {
  return pageOrFrame.evaluate(() => {
    const images = Array.from(globalThis.document.images);
    const host = globalThis.document.querySelector('snapshot-card');
    const root = host?.shadowRoot;
    const nestedRoot = root?.querySelector('inner-snapshot-card')?.shadowRoot;
    const nestedImage = nestedRoot?.querySelector('img');
    const hostStyle = host ? globalThis.getComputedStyle(host) : null;
    const sensitiveControl = globalThis.document.querySelector('#sensitive-proof');
    const sensitiveRect = sensitiveControl?.getBoundingClientRect();
    const inlineMaskIcon = globalThis.document.querySelector('.inline-mask-icon');
    const inlineMaskStyle = inlineMaskIcon ? globalThis.getComputedStyle(inlineMaskIcon) : null;
    const escapedMaskIcon = globalThis.document.querySelector('.escaped-mask-icon');
    const escapedMaskStyle = escapedMaskIcon ? globalThis.getComputedStyle(escapedMaskIcon) : null;
    const dynamicPanel = globalThis.document.querySelector('.dynamic-panel');

    return {
      capturedStyleHasImportTail: Array.from(
        globalThis.document.querySelectorAll('style[data-sniptale-captured-stylesheet="true"]')
      ).some((style) => /600;\s*700&(?:family|display)=/u.test(style.textContent ?? '')),
      documentHeight: globalThis.document.documentElement.scrollHeight,
      documentWidth: globalThis.document.documentElement.scrollWidth,
      dynamicPanelExpanded: dynamicPanel?.getAttribute('data-expanded') === 'true',
      elementCount: globalThis.document.querySelectorAll('*').length,
      escapedMaskImage: escapedMaskStyle?.maskImage || escapedMaskStyle?.webkitMaskImage || null,
      hasBody: Boolean(globalThis.document.body),
      loadedImages: images.filter((image) => image.naturalWidth > 0).length,
      inlineMaskImage: inlineMaskStyle?.maskImage || inlineMaskStyle?.webkitMaskImage || null,
      revealedSectionCount: globalThis.document.querySelectorAll('section.visible').length,
      scriptCount: globalThis.document.querySelectorAll('script').length,
      sensitiveProof:
        sensitiveControl && sensitiveRect
          ? {
              backgroundColor: globalThis.getComputedStyle(sensitiveControl).backgroundColor,
              x: sensitiveRect.left + sensitiveRect.width / 2,
              y: sensitiveRect.top + globalThis.scrollY + sensitiveRect.height / 2,
            }
          : null,
      shadowCard:
        host && root && hostStyle
          ? {
              display: hostStyle.display,
              nestedImageWidth: nestedImage?.naturalWidth ?? 0,
              nestedInputValue: nestedRoot?.querySelector('input')?.value ?? '',
              nestedText: nestedRoot?.textContent.trim() ?? '',
            }
          : null,
      textLength: globalThis.document.body?.innerText.replace(/\s+/gu, ' ').trim().length ?? 0,
      viewportHeight: globalThis.innerHeight,
      viewportWidth: globalThis.innerWidth,
    };
  });
}

export async function inspectFrameBodyCascade(context, page) {
  const session = await context.newCDPSession(page);
  try {
    await Promise.all([session.send('DOM.enable'), session.send('CSS.enable')]);
    const { root } = await session.send('DOM.getDocument', { depth: -1, pierce: true });
    const findFrameDocument = (node) => {
      if (node.nodeName === 'IFRAME' && node.contentDocument) return node.contentDocument;
      for (const child of node.children ?? []) {
        const found = findFrameDocument(child);
        if (found) return found;
      }
      return null;
    };
    const frameDocument = findFrameDocument(root);
    if (!frameDocument) return null;
    const { nodeId } = await session.send('DOM.querySelector', {
      nodeId: frameDocument.nodeId,
      selector: 'body',
    });
    const matched = await session.send('CSS.getMatchedStylesForNode', { nodeId });
    const compactRule = (entry) => ({
      origin: entry.rule.origin,
      selector: entry.rule.selectorList.text,
      style: entry.rule.style.cssProperties
        .filter((property) => /^(?:all|font|font-size)$/i.test(property.name))
        .map((property) => ({
          name: property.name,
          value: property.value,
          important: property.important ?? false,
        })),
    });
    return {
      inherited: (matched.inherited ?? []).map((entry) => ({
        inlineStyle: entry.inlineStyle?.cssProperties
          .filter((property) => /^(?:all|font|font-size)$/i.test(property.name))
          .map((property) => ({ name: property.name, value: property.value })),
        rules: entry.matchedCSSRules.map(compactRule).filter((entry) => entry.style.length > 0),
      })),
      matched: matched.matchedCSSRules.map(compactRule).filter((entry) => entry.style.length > 0),
    };
  } finally {
    await session.detach();
  }
}
