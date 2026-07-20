import { formatDateTime, translate, type AppLocale } from '../../../../platform/i18n';
import { getBrowserVersion } from '../../core/helpers';
import {
  orderTechnicalDataKinds,
  type EditorTechnicalDataKind,
  type EditorTechnicalDataLayout,
} from '../technical-data';

function buildTechnicalDataSection(
  kind: EditorTechnicalDataKind,
  sourceUrl: string,
  sourceTitle: string,
  locale: AppLocale
): string {
  if (kind === 'url') {
    return `${translate('editor.runtime.metaStampUrlLabel', locale)}\n${
      sourceUrl || 'https://example.com'
    }`;
  }
  if (kind === 'date') {
    return `${translate('editor.runtime.metaStampDateLabel', locale)}\n${formatDateTime(
      new Date(),
      { dateStyle: 'medium', timeStyle: 'short' },
      locale
    )}`;
  }
  return `${translate('editor.runtime.metaStampBrowserLabel', locale)}\n${getBrowserVersion()}${
    sourceTitle ? `\n${translate('editor.runtime.metaStampPageLabel', locale)}: ${sourceTitle}` : ''
  }`;
}

function buildTechnicalDataRowSection(
  kind: EditorTechnicalDataKind,
  sourceUrl: string,
  sourceTitle: string,
  locale: AppLocale
): string {
  if (kind === 'url') {
    return `${translate('editor.runtime.metaStampUrlLabel', locale)}: ${
      sourceUrl || 'https://example.com'
    }`;
  }
  if (kind === 'date') {
    return `${translate('editor.runtime.metaStampDateLabel', locale)}: ${formatDateTime(
      new Date(),
      { dateStyle: 'medium', timeStyle: 'short' },
      locale
    )}`;
  }
  return `${translate('editor.runtime.metaStampBrowserLabel', locale)}: ${getBrowserVersion()}${
    sourceTitle
      ? ` · ${translate('editor.runtime.metaStampPageLabel', locale)}: ${sourceTitle}`
      : ''
  }`;
}

export function buildTechnicalDataText(options: {
  kinds: readonly EditorTechnicalDataKind[];
  layout: EditorTechnicalDataLayout;
  sourceUrl: string;
  sourceTitle: string;
  locale: AppLocale;
}): string {
  const buildSection =
    options.layout === 'row' ? buildTechnicalDataRowSection : buildTechnicalDataSection;
  return orderTechnicalDataKinds(options.kinds)
    .map((kind) => buildSection(kind, options.sourceUrl, options.sourceTitle, options.locale))
    .join(options.layout === 'row' ? ' · ' : '\n\n');
}
