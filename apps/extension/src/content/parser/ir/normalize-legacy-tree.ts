import type {
  DocumentBlock,
  PayloadTraceEntry,
  PageProfile,
  ParsedDOMTree,
  ParsedDocument,
  PipelineTrace,
  RootSelectionTrace,
  SectionNode,
  TableNode,
  TableRow,
  FieldNode,
  ParsedDocumentMeta,
  TargetRef,
} from '@sniptale/runtime-contracts/dom-tree';
import { finalizeParsedDocument } from './finalize-parsed-document';

type ParsedDocumentMetaTrace = {
  detectorTrace?: PageProfile['matchedSignals'];
  payloadTrace?: PayloadTraceEntry[];
  pipelineTrace?: PipelineTrace;
  rootSelection?: RootSelectionTrace;
  blocks?: DocumentBlock[];
  pageContext?: string;
  pageTitle?: string;
  pageUrl?: string;
};

function buildTargetRef(
  nodeId: string,
  selector: string | undefined,
  editable: boolean
): TargetRef | undefined {
  const selectors = selector ? [selector] : [];
  if (!editable && selectors.length === 0) {
    return undefined;
  }

  return {
    realmId: 'document',
    sniptaleId: nodeId,
    selectors,
    anchorStrategy: selectors.length > 0 ? 'sniptale' : 'payload-only',
    editable,
  };
}

function normalizeField(field: FieldNode, profile: PageProfile): FieldNode {
  const editable = field.editable ?? (field.valueType !== 'image' && field.valueType !== 'status');
  const targetRef = field.targetRef ?? buildTargetRef(field.id, field.selector, editable);
  return {
    ...field,
    confidence: field.confidence ?? 1,
    editable,
    provenance: field.provenance ?? {
      extractorId: 'legacy-parser',
      pipelineId: profile.pipelineId,
      profileId: `${profile.vendor}/${profile.pageKind}`,
    },
    ...(targetRef === undefined ? {} : { targetRef }),
  };
}

function normalizeRow(row: TableRow, profile: PageProfile): TableRow {
  const targetRef = row.targetRef ?? buildTargetRef(row.id, row.selector, true);
  return {
    ...row,
    confidence: row.confidence ?? 1,
    editable: row.editable ?? true,
    provenance: row.provenance ?? {
      extractorId: 'legacy-parser',
      pipelineId: profile.pipelineId,
      profileId: `${profile.vendor}/${profile.pageKind}`,
    },
    ...(targetRef === undefined ? {} : { targetRef }),
  };
}

function normalizeTable(table: TableNode, profile: PageProfile): TableNode {
  return {
    ...table,
    confidence: table.confidence ?? 1,
    editable: table.editable ?? table.rows.some((row) => row.editable ?? row.selected),
    provenance: table.provenance ?? {
      extractorId: 'legacy-parser',
      pipelineId: profile.pipelineId,
      profileId: `${profile.vendor}/${profile.pageKind}`,
    },
    rows: table.rows.map((row) => normalizeRow(row, profile)),
  };
}

function normalizeSections(sections: SectionNode[], profile: PageProfile): SectionNode[] {
  return sections.map((section) => {
    const normalizedSection: SectionNode = {
      ...section,
      confidence: section.confidence ?? 1,
      editable: section.editable ?? section.children.some((child) => child.editable !== false),
      provenance: section.provenance ?? {
        extractorId: 'legacy-parser',
        pipelineId: profile.pipelineId,
        profileId: `${profile.vendor}/${profile.pageKind}`,
      },
      children: section.children.map((child) => {
        return child.type === 'field'
          ? normalizeField(child, profile)
          : normalizeTable(child, profile);
      }),
    };

    return section.kind === undefined
      ? normalizedSection
      : { ...normalizedSection, kind: section.kind };
  });
}

function resolveLegacyDocumentUrl(
  legacyTree: ParsedDOMTree,
  trace: ParsedDocumentMetaTrace | undefined
): string {
  return trace?.pageUrl ?? legacyTree.meta?.url ?? '';
}

export function normalizeLegacyTree(
  legacyTree: ParsedDOMTree,
  profile: PageProfile,
  trace?: ParsedDocumentMetaTrace
): ParsedDocument {
  const sections = normalizeSections(legacyTree.structure, profile);
  const detectorTrace = trace?.detectorTrace ?? legacyTree.meta?.detectorTrace;
  const payloadTrace = trace?.payloadTrace ?? legacyTree.meta?.payloadTrace;
  const pipelineTrace = trace?.pipelineTrace ?? legacyTree.meta?.pipelineTrace;
  const rootSelection = trace?.rootSelection ?? legacyTree.meta?.rootSelection;
  const meta: ParsedDocumentMeta = {
    profile,
    title: trace?.pageTitle ?? legacyTree.title,
    url: resolveLegacyDocumentUrl(legacyTree, trace),
    warnings: legacyTree.meta?.warnings ?? [],
    ...(detectorTrace === undefined ? {} : { detectorTrace }),
    ...(payloadTrace === undefined ? {} : { payloadTrace }),
    ...(pipelineTrace === undefined ? {} : { pipelineTrace }),
    ...(rootSelection === undefined ? {} : { rootSelection }),
  };

  return finalizeParsedDocument({
    ...legacyTree,
    context: trace?.pageContext ?? legacyTree.context,
    sections,
    structure: sections,
    title: trace?.pageTitle ?? legacyTree.title,
    ...((trace?.blocks ?? legacyTree.blocks) ? { blocks: trace?.blocks ?? legacyTree.blocks } : {}),
    meta,
  });
}
