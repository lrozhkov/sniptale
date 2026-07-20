import {
  PageLinkCopyFormat,
  type PageLinkCopyFormat as PageLinkCopyFormatValue,
} from './constants';

interface PageLinkData {
  title: string;
  url: string;
}

interface PageLinkClipboardPayload {
  html?: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeMarkdownLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]');
}

function escapeMarkdownUrl(value: string): string {
  return value.replaceAll('\\', '%5C').replaceAll(')', '%29');
}

export function formatPageLinkClipboardPayload(
  data: PageLinkData,
  format: PageLinkCopyFormatValue
): PageLinkClipboardPayload {
  switch (format) {
    case PageLinkCopyFormat.RICH:
      return {
        html: `<a href="${escapeHtml(data.url)}">${escapeHtml(data.title)}</a>`,
        text: `${data.title}\n${data.url}`,
      };
    case PageLinkCopyFormat.MARKDOWN:
      return {
        text: `[${escapeMarkdownLabel(data.title)}](${escapeMarkdownUrl(data.url)})`,
      };
    case PageLinkCopyFormat.PLAIN:
      return {
        text: `${data.title}\n${data.url}`,
      };
  }
}
