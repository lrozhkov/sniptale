import type {
  DocumentBlock,
  ExtractionClass,
  FieldNode,
  ParsedDocument,
  SectionKind,
  SectionNode,
  TableNode,
} from '@sniptale/runtime-contracts/dom-tree';
import { appendLegacyBlock } from './document-blocks-legacy';

function createDocumentBlock(args: {
  id: string;
  sectionId: string;
  kind: DocumentBlock['kind'];
  text: string | undefined;
  items: string[] | undefined;
  tableRef: string | undefined;
  targetRef: DocumentBlock['targetRef'] | undefined;
  evidence: DocumentBlock['evidence'] | undefined;
  provenance: DocumentBlock['provenance'] | undefined;
}): DocumentBlock {
  return {
    id: args.id,
    sectionId: args.sectionId,
    kind: args.kind,
    ...(args.text === undefined ? {} : { text: args.text }),
    ...(args.items === undefined ? {} : { items: args.items }),
    ...(args.tableRef === undefined ? {} : { tableRef: args.tableRef }),
    ...(args.targetRef === undefined ? {} : { targetRef: args.targetRef }),
    ...(args.evidence === undefined ? {} : { evidence: args.evidence }),
    ...(args.provenance === undefined ? {} : { provenance: args.provenance }),
  };
}

function isCommentTable(table: TableNode): boolean {
  const headers = new Set(table.headers);
  return headers.has('Автор') && headers.has('Дата') && headers.has('Текст');
}

function inferKindFromChildren(section: SectionNode): SectionKind {
  if (section.kind) {
    return section.kind;
  }

  if (/вложени/i.test(section.title)) {
    return 'attachments';
  }

  const tables = section.children.filter((child) => child.type === 'table');
  if (tables.some((table) => isCommentTable(table))) {
    return 'thread';
  }

  if (
    section.children.some((child) => {
      return child.type === 'field' && child.contentRole !== undefined;
    })
  ) {
    return 'narrative';
  }

  if (tables.length > 0 && section.children.length === tables.length) {
    return 'results';
  }

  return 'record';
}

function buildNarrativeBlock(sectionId: string, field: FieldNode): DocumentBlock {
  if (field.contentRole === 'list-item') {
    return createDocumentBlock({
      id: `${field.id}-list-item`,
      sectionId,
      kind: 'list',
      text: undefined,
      items: [field.value],
      tableRef: undefined,
      targetRef: field.targetRef,
      evidence: field.evidence,
      provenance: field.provenance,
    });
  }

  return createDocumentBlock({
    id: `${field.id}-paragraph`,
    sectionId,
    kind: 'paragraph',
    text: field.value,
    items: undefined,
    tableRef: undefined,
    targetRef: field.targetRef,
    evidence: field.evidence,
    provenance: field.provenance,
  });
}

function buildFieldBlock(sectionId: string, field: FieldNode): DocumentBlock {
  if (field.contentRole === 'paragraph' || field.contentRole === 'list-item') {
    return buildNarrativeBlock(sectionId, field);
  }

  return createDocumentBlock({
    id: `${field.id}-record`,
    sectionId,
    kind: 'record-field',
    text: `${field.label}: ${field.value}`,
    items: [field.label, field.value],
    tableRef: undefined,
    targetRef: field.targetRef,
    evidence: field.evidence,
    provenance: field.provenance,
  });
}

function buildAttachmentBlocks(sectionId: string, table: TableNode): DocumentBlock[] {
  return table.rows.flatMap((row) => {
    return (row.attachments ?? []).map((attachment, index) =>
      createDocumentBlock({
        id: `${row.id}-attachment-${index + 1}`,
        sectionId,
        kind: 'attachment',
        text: attachment.uuid,
        items: [attachment.src],
        tableRef: undefined,
        targetRef: undefined,
        evidence: row.evidence,
        provenance: row.provenance,
      })
    );
  });
}

function buildCommentRowBlocks(sectionId: string, table: TableNode): DocumentBlock[] {
  return table.rows.flatMap((row) => {
    return [
      createDocumentBlock({
        id: `${row.id}-thread`,
        sectionId,
        kind: 'thread-message',
        text: row.data['Текст'] ?? '',
        items: [row.data['Автор'] ?? '', row.data['Дата'] ?? ''].filter(Boolean),
        tableRef: undefined,
        targetRef: row.targetRef,
        evidence: row.evidence,
        provenance: row.provenance,
      }),
      ...buildAttachmentBlocks(sectionId, {
        ...table,
        rows: [row],
      }),
    ];
  });
}

function buildDataTableBlock(sectionId: string, table: TableNode): DocumentBlock {
  return createDocumentBlock({
    id: `${table.id}-table`,
    sectionId,
    kind: 'data-table',
    text: undefined,
    items: undefined,
    tableRef: table.id,
    targetRef: table.targetRef,
    evidence: table.evidence,
    provenance: table.provenance,
  });
}

function buildTableBlocks(sectionId: string, table: TableNode): DocumentBlock[] {
  if (isCommentTable(table)) {
    return buildCommentRowBlocks(sectionId, table);
  }

  return [buildDataTableBlock(sectionId, table), ...buildAttachmentBlocks(sectionId, table)];
}

export function deriveDocumentBlocksFromSections(sections: SectionNode[]): DocumentBlock[] {
  return sections.flatMap((section) => {
    const sectionKind = inferKindFromChildren(section);
    const blocks: DocumentBlock[] = [
      {
        id: `${section.id}-heading`,
        sectionId: section.id,
        kind: 'heading',
        text: section.title,
      },
    ];

    section.children.forEach((child) => {
      if (child.type === 'field') {
        blocks.push(buildFieldBlock(section.id, child));
        return;
      }

      blocks.push(...buildTableBlocks(section.id, child));
    });

    if (sectionKind === 'attachments' && section.children.length === 0) {
      blocks.push({
        id: `${section.id}-attachment`,
        sectionId: section.id,
        kind: 'attachment',
        text: section.title,
      });
    }

    return blocks;
  });
}

export function deriveLegacySectionsFromBlocks(
  sectionShells: SectionNode[],
  blocks: DocumentBlock[]
): SectionNode[] {
  const sections = sectionShells.map((section) => ({
    ...section,
    kind: inferKindFromChildren(section),
    children: [...section.children],
  }));
  const byId = new Map(sections.map((section) => [section.id, section]));
  const narrativeIndex = new Map<string, number>();

  blocks.forEach((block) => {
    const section = byId.get(block.sectionId);
    if (!section) {
      return;
    }

    const nextIndex = appendLegacyBlock(section, block, narrativeIndex.get(section.id) ?? 0);
    narrativeIndex.set(section.id, nextIndex);
  });

  return sections;
}

export function inferExtractionClass(
  documentData: Pick<ParsedDocument, 'blocks' | 'structure'>
): ExtractionClass {
  const sectionKinds = new Set(
    documentData.structure.map((section) => inferKindFromChildren(section))
  );

  if (sectionKinds.size === 0 && (documentData.blocks?.length ?? 0) === 0) {
    return 'unknown';
  }

  if (sectionKinds.size === 1) {
    const [kind] = [...sectionKinds];
    if (kind === 'record') {
      return 'record';
    }
    if (kind === 'narrative') {
      return 'narrative';
    }
    if (kind === 'thread') {
      return 'thread';
    }
    if (kind === 'results') {
      return 'results';
    }
  }

  return 'mixed';
}

export function resolveSectionKinds(sections: SectionNode[]): SectionNode[] {
  return sections.map((section) => ({
    ...section,
    kind: inferKindFromChildren(section),
  }));
}
