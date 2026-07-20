import type { ExportData, ExportSection } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { getDocumentSections, getSectionTables } from '../../ir/document-helpers';
import { resolveExportManagerPageMetadata } from '../../../platform/page-context/page-metadata';
import { getMoscowTimestamp } from '../files/naming';
import { buildSectionFields } from './narrative';
export {
  buildExportArchiveBaseName,
  createEmptyExportPagePackage,
  getMoscowTimestamp,
  sanitizeFilename,
} from '../files/naming';
export { createExportStats } from './stats';

export function buildExportData(tree: ParsedDOMTree): ExportData {
  const pageMetadata = resolveExportManagerPageMetadata(tree);
  const sections: ExportSection[] = getDocumentSections(tree).map((section) => {
    const exportSection: ExportSection = {
      title: section.title,
    };

    const fields = buildSectionFields(tree, section);
    if (fields.length > 0) {
      exportSection.fields = fields;
    }

    const tables = getSectionTables(section);
    if (tables.length > 0) {
      exportSection.tables = tables.map((table) => ({
        title: section.title,
        headers: table.headers,
        rows: table.rows.map((row) => ({
          data: row.data,
          attachments: [],
        })),
      }));
    }

    return exportSection;
  });

  return {
    meta: {
      url: pageMetadata.pageUrl,
      title: pageMetadata.pageTitle,
      date: getMoscowTimestamp(),
      userAgent: navigator.userAgent,
    },
    sections,
  };
}
