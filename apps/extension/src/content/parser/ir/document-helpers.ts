import type {
  DocumentBlock,
  FieldNode,
  ParsedDocument,
  SectionNode,
  TableNode,
} from '@sniptale/runtime-contracts/dom-tree';

export function getDocumentSections(documentData: ParsedDocument): SectionNode[] {
  return documentData.sections ?? documentData.structure;
}

function getDocumentBlocks(documentData: ParsedDocument): DocumentBlock[] {
  return documentData.blocks ?? [];
}

export function getSectionFields(section: SectionNode): FieldNode[] {
  return section.children.filter((child): child is FieldNode => child.type === 'field');
}

export function getSectionTables(section: SectionNode): TableNode[] {
  return section.children.filter((child): child is TableNode => child.type === 'table');
}

export function getSectionBlocks(
  documentData: ParsedDocument,
  section: Pick<SectionNode, 'id'>
): DocumentBlock[] {
  return getDocumentBlocks(documentData).filter((block) => block.sectionId === section.id);
}

export function getSelectedSections(documentData: ParsedDocument) {
  return getDocumentSections(documentData)
    .map((section) => {
      const fields = getSectionFields(section).filter((field) => {
        return field.selected !== false && field.editable !== false;
      });
      const tables = getSectionTables(section).filter((table) => {
        return (
          table.editable !== false &&
          (table.selected !== false ||
            table.rows.some((row) => row.selected && row.editable !== false))
        );
      });

      return {
        sectionTitle: section.title,
        fields,
        tables: tables.map((table) => ({
          ...table,
          rows: table.rows.filter((row) => row.selected && row.editable !== false),
        })),
      };
    })
    .filter(({ fields, tables }) => fields.length > 0 || tables.length > 0);
}
