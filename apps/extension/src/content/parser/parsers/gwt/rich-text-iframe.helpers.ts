import { cloneRichTextContent, sanitizeRichTextToText } from '../../rich-text-content';

type RichTextIframeImage = {
  src: string;
  uuid: string;
};

type RichTextContentOptions = {
  removeHidden?: boolean;
};

type RichTextIframeContent = {
  images: RichTextIframeImage[];
  text: string;
};

function isVirtualRichTextIframeContainer(iframe: HTMLIFrameElement | HTMLElement): boolean {
  return (
    (iframe as HTMLElement).getAttribute?.('data-virtual-iframe') === 'true' ||
    (iframe as HTMLElement).id?.startsWith('iframe$') ||
    (iframe.tagName === 'DIV' &&
      Boolean((iframe as HTMLElement).querySelector('[data-iframe-source]')))
  );
}

function extractRichTextIframeImages(container: HTMLElement): RichTextIframeImage[] {
  return Array.from(container.querySelectorAll('img[src*="uuid=file$"]'))
    .map((img) => img as HTMLImageElement)
    .map((img) => {
      const match = img.src.match(/uuid=file\$(\w+)/);
      return match ? { src: img.src, uuid: match[1] } : null;
    })
    .filter((image): image is RichTextIframeImage => image !== null);
}

export function extractRichTextIframeContent(
  container: HTMLElement,
  options: RichTextContentOptions = {}
): RichTextIframeContent | null {
  try {
    const images = extractRichTextIframeImages(container);
    const clone = cloneRichTextContent(container);

    if (options.removeHidden) {
      clone.querySelectorAll('.hidden').forEach((element) => element.remove());
    }

    clone.querySelectorAll('img[src*="uuid=file$"]').forEach((img, index) => {
      const uuid = images[index]?.uuid || `image_${index + 1}`;
      img.replaceWith(document.createTextNode(` [file_${uuid}] `));
    });

    return {
      images,
      text: sanitizeRichTextToText(clone),
    };
  } catch {
    return null;
  }
}

export function extractFroalaIframeContent(
  iframe: HTMLIFrameElement | HTMLElement,
  options: RichTextContentOptions = {}
): RichTextIframeContent | null {
  try {
    const richTextContainer = resolveRichTextContentContainer(iframe);
    if (!richTextContainer) {
      return null;
    }

    return extractRichTextIframeContent(richTextContainer, options);
  } catch {
    return null;
  }
}

function resolveAccessibleIframeBody(iframe: HTMLIFrameElement): HTMLElement | null {
  const iframeSrc = iframe.src || '';
  const iframeOrigin = new URL(iframeSrc, window.location.href).origin;
  if (
    iframeOrigin !== window.location.origin &&
    !iframeSrc.startsWith('about:') &&
    !iframeSrc.startsWith('richText')
  ) {
    return null;
  }

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  return iframeDoc?.body ?? null;
}

function resolveRichTextContentContainer(
  iframe: HTMLIFrameElement | HTMLElement
): HTMLElement | null {
  if (isVirtualRichTextIframeContainer(iframe)) {
    return iframe as HTMLElement;
  }

  return resolveAccessibleIframeBody(iframe as HTMLIFrameElement);
}
