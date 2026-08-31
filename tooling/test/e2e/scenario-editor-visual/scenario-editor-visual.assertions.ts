import { expect, type Page } from '@playwright/test';

export async function assertVisualAcceptance(page: Page): Promise<void> {
  await assertNoBrokenImagePlaceholders(page);
  await assertNonblankCanvas(page);
  await assertNoDocumentHorizontalOverflow(page);
  await assertNoChromeTextClipping(page);
  await assertCanvasStageKeepsFloatingChromeClearance(page);
  await assertFloatingChromeSurfacesDoNotCollide(page);
  await assertOverlaysStayInsideSlideBounds(page);
}

async function assertNoBrokenImagePlaceholders(page: Page): Promise<void> {
  const failures = await page.evaluate(() => {
    const readCanvasLabel = (src: string) => {
      const svg = decodeURIComponent(src.slice(src.indexOf(',') + 1));
      return svg.match(/aria-label="([^"]+)"/)?.[1] ?? 'canvas';
    };
    const brokenImages = Array.from(document.images).flatMap((image) => {
      if (image.complete && image.naturalWidth > 0) {
        return [];
      }
      if (image.src.startsWith('data:image/svg')) {
        return [`${readCanvasLabel(image.src)}: broken canvas image`];
      }
      return [image.currentSrc || image.src || image.alt || 'inline image'];
    });
    const canvasMissing = Array.from(document.images).flatMap((image) => {
      if (!image.src.startsWith('data:image/svg')) {
        return [];
      }
      const svg = decodeURIComponent(image.src.slice(image.src.indexOf(',') + 1));
      return svg.includes('Missing image') || svg.includes('Missing asset')
        ? [`${readCanvasLabel(image.src)}: missing image placeholder`]
        : [];
    });
    const bodyText = document.body.textContent ?? '';
    const missingSvgText =
      bodyText.includes('Missing image') ||
      bodyText.includes('Missing asset') ||
      bodyText.includes('изображений недоступна');
    return [...brokenImages, ...canvasMissing, ...(missingSvgText ? ['svg missing image'] : [])];
  });
  expect.soft(failures).toEqual([]);
}

async function assertNonblankCanvas(page: Page): Promise<void> {
  const blankCanvases = await page.evaluate(() => {
    const getVisibleCanvasImageSources = () => {
      return Array.from(document.images)
        .filter((image) => {
          const rect = image.getBoundingClientRect();
          return rect.width >= 200 && rect.height >= 100 && image.src.startsWith('data:image/svg');
        })
        .map((image) => decodeURIComponent(image.src.slice(image.src.indexOf(',') + 1)));
    };
    const countRenderableNodes = (svg: string) => {
      return (svg.match(/<(circle|ellipse|image|line|path|polygon|rect|text)\b/g) ?? []).length;
    };

    return getVisibleCanvasImageSources()
      .map((svg, index) => ({ index, renderNodeCount: countRenderableNodes(svg) }))
      .filter((entry) => entry.renderNodeCount === 0);
  });
  expect.soft(blankCanvases).toEqual([]);
}

async function assertNoDocumentHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const rootOverflow = document.documentElement.scrollWidth - window.innerWidth;
    const bodyOverflow = document.body.scrollWidth - window.innerWidth;
    return Math.max(bodyOverflow, rootOverflow);
  });
  expect.soft(overflow).toBeLessThanOrEqual(1);
}

async function assertNoChromeTextClipping(page: Page): Promise<void> {
  const clipped = await page.evaluate(() => {
    const getScenarioChromeOwners = () => {
      const shell = document.querySelector('[data-ui="scenario.v3-shell.root"]');
      const toolbar =
        shell?.firstElementChild instanceof HTMLElement ? shell.firstElementChild : null;
      return [
        toolbar,
        document.querySelector('[data-ui="scenario.inspector.panel"]'),
        document.querySelector('[data-ui="scenario.slide-rail.panel"]'),
      ].filter((owner): owner is HTMLElement => owner instanceof HTMLElement);
    };
    const hasOwnText = (element: HTMLElement) => {
      return Array.from(element.childNodes).some((node) => {
        return node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim());
      });
    };
    const hasVisibleOwnText = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && hasOwnText(element)
      );
    };
    const allowsTextClipping = (element: HTMLElement) => {
      const style = window.getComputedStyle(element);
      return (
        style.textOverflow === 'ellipsis' ||
        element.className.toString().includes('truncate') ||
        element.className.toString().includes('line-clamp')
      );
    };
    const hasUnexpectedTextClipping = (element: HTMLElement) => {
      if (allowsTextClipping(element)) {
        return false;
      }
      const horizontalClip = element.scrollWidth > element.clientWidth + 1;
      const verticalClip = element.scrollHeight > element.clientHeight + 1;
      return horizontalClip || verticalClip;
    };

    return getScenarioChromeOwners().flatMap((owner) => {
      return Array.from(owner.querySelectorAll<HTMLElement>('*'))
        .filter(hasVisibleOwnText)
        .filter(hasUnexpectedTextClipping)
        .map((element) => element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80));
    });
  });
  expect.soft(clipped).toEqual([]);
}

async function assertCanvasStageKeepsFloatingChromeClearance(page: Page): Promise<void> {
  const intersections = await page.evaluate(() => {
    const isVisibleElement = (element: HTMLElement | null): element is HTMLElement => {
      if (!element) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
    };
    const rectanglesIntersect = (first: DOMRect, second: DOMRect): boolean => {
      const tolerance = 1;
      return (
        first.left < second.right - tolerance &&
        first.right > second.left + tolerance &&
        first.top < second.bottom - tolerance &&
        first.bottom > second.top + tolerance
      );
    };
    const stage = document.querySelector<HTMLElement>('[data-ui="scenario.canvas.stage"]');
    if (!stage) {
      return [];
    }
    const chromeSelectors = [
      '[data-ui="scenario.floating.document-bar"]',
      '[data-ui="scenario.floating.view-controls.stack"]',
      '[data-ui="scenario.floating.tool-rail.stack"]',
      '[data-ui="scenario.floating.left-stack"]',
      '[data-ui="scenario.floating.right-stack"]',
      '[data-ui="scenario.editor.ai-panel"]',
      '[data-ui="scenario.floating.build-timeline"]',
    ];
    const stageRect = stage.getBoundingClientRect();
    return chromeSelectors
      .map((selector) => document.querySelector<HTMLElement>(selector))
      .filter((element): element is HTMLElement => isVisibleElement(element))
      .map((element) => ({ rect: element.getBoundingClientRect(), ui: element.dataset.ui }))
      .filter((entry) => rectanglesIntersect(stageRect, entry.rect))
      .map((entry) => entry.ui);
  });

  expect.soft(intersections).toEqual([]);
}

async function assertFloatingChromeSurfacesDoNotCollide(page: Page): Promise<void> {
  const collisions = await page.evaluate(() => {
    const isVisibleElement = (element: HTMLElement | null): element is HTMLElement => {
      if (!element) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
    };
    const rectanglesIntersect = (first: DOMRect, second: DOMRect): boolean => {
      const tolerance = 1;
      return (
        first.left < second.right - tolerance &&
        first.right > second.left + tolerance &&
        first.top < second.bottom - tolerance &&
        first.bottom > second.top + tolerance
      );
    };
    const chromeSelectors = [
      '[data-ui="scenario.floating.document-bar"]',
      '[data-ui="scenario.floating.view-controls.stack"]',
      '[data-ui="scenario.floating.tool-rail.stack"]',
      '[data-ui="scenario.floating.left-stack"]',
      '[data-ui="scenario.floating.right-stack"]',
      '[data-ui="scenario.editor.ai-panel"]',
      '[data-ui="scenario.floating.build-timeline"]',
    ];
    const chromeRects = chromeSelectors
      .map((selector) => document.querySelector<HTMLElement>(selector))
      .filter((element): element is HTMLElement => isVisibleElement(element))
      .map((element) => ({ rect: element.getBoundingClientRect(), ui: element.dataset.ui }));
    return chromeRects.flatMap((first, firstIndex) => {
      return chromeRects
        .slice(firstIndex + 1)
        .filter((second) => rectanglesIntersect(first.rect, second.rect))
        .map((second) => `${first.ui} overlaps ${second.ui}`);
    });
  });

  expect.soft(collisions).toEqual([]);
}

async function assertOverlaysStayInsideSlideBounds(page: Page): Promise<void> {
  const escaped = await page.evaluate(() => {
    const getVisibleCanvasDocuments = () => {
      return Array.from(document.images)
        .filter((image) => {
          const rect = image.getBoundingClientRect();
          return rect.width >= 200 && rect.height >= 100 && image.src.startsWith('data:image/svg');
        })
        .map((image) => decodeURIComponent(image.src.slice(image.src.indexOf(',') + 1)))
        .map((svg) => new DOMParser().parseFromString(svg, 'image/svg+xml'));
    };
    const getNumberAttribute = (element: Element, name: string) => {
      const value = element.getAttribute(name);
      return value === null || value.endsWith('%') ? null : Number(value);
    };
    const isOutsideViewBox = (element: Element, width: number, height: number) => {
      const x = getNumberAttribute(element, 'x') ?? 0;
      const y = getNumberAttribute(element, 'y') ?? 0;
      const elementWidth = getNumberAttribute(element, 'width');
      const elementHeight = getNumberAttribute(element, 'height');
      if (elementWidth === null || elementHeight === null) return false;
      const tolerance = 1;
      return (
        x < -tolerance ||
        y < -tolerance ||
        x + elementWidth > width + tolerance ||
        y + elementHeight > height + tolerance
      );
    };
    const getBoxRecord = (element: Element) => {
      return {
        height: getNumberAttribute(element, 'height'),
        width: getNumberAttribute(element, 'width'),
        x: getNumberAttribute(element, 'x') ?? 0,
        y: getNumberAttribute(element, 'y') ?? 0,
      };
    };

    return getVisibleCanvasDocuments().flatMap((document, svgIndex) => {
      const svg = document.documentElement;
      const [, , width, height] = (svg.getAttribute('viewBox') ?? '0 0 0 0').split(' ');
      return Array.from(document.querySelectorAll('image, rect, text'))
        .filter((node) => node.tagName !== 'image' || !node.closest('[clip-path]'))
        .filter((node) => isOutsideViewBox(node, Number(width), Number(height)))
        .map((node) => ({ box: getBoxRecord(node), svgIndex, tag: node.tagName }));
    });
  });
  expect.soft(escaped).toEqual([]);
}
