import type {
  EvidenceRef,
  FieldNode,
  TableNode,
  TableRow,
  TargetRef,
} from '@sniptale/runtime-contracts/dom-tree';

const UNSAFE_AI_PAYLOAD_LOCATOR_PATTERNS = [
  /\s=>\s/u,
  /contenteditable/iu,
  /\brole\s*=\s*["']?(?:textbox|searchbox)["']?/iu,
  /\btype\s*=\s*["']?hidden["']?/iu,
  /data-(?:virtual-iframe|iframe-source)/iu,
  /shadow[-\s_]?root|shadowroot|::shadow/iu,
] as const;
const UNSAFE_AI_PAYLOAD_EVIDENCE_SOURCES = new Set<EvidenceRef['source']>(['virtual-dom']);

function hasUnsafeAiPayloadLocator(value: string | undefined): boolean {
  return Boolean(
    value && UNSAFE_AI_PAYLOAD_LOCATOR_PATTERNS.some((pattern) => pattern.test(value))
  );
}

function hasUnsafeAiPayloadEvidence(evidence: EvidenceRef[] | undefined): boolean {
  return Boolean(
    evidence?.some(
      (item) =>
        UNSAFE_AI_PAYLOAD_EVIDENCE_SOURCES.has(item.source) ||
        hasUnsafeAiPayloadLocator(item.locator)
    )
  );
}

function hasUnsafeAiPayloadTarget(targetRef: TargetRef | undefined): boolean {
  return Boolean(targetRef?.selectors.some((selector) => hasUnsafeAiPayloadLocator(selector)));
}

export function isAllowedAiFieldPayload(field: FieldNode): boolean {
  return (
    !hasUnsafeAiPayloadEvidence(field.evidence) &&
    !hasUnsafeAiPayloadLocator(field.selector) &&
    !hasUnsafeAiPayloadTarget(field.targetRef)
  );
}

function isAllowedAiTableRowPayload(table: TableNode, row: TableRow): boolean {
  return (
    !hasUnsafeAiPayloadEvidence(table.evidence) &&
    !hasUnsafeAiPayloadTarget(table.targetRef) &&
    !hasUnsafeAiPayloadEvidence(row.evidence) &&
    !hasUnsafeAiPayloadLocator(row.selector) &&
    !hasUnsafeAiPayloadTarget(row.targetRef)
  );
}

export function getAllowedAiTableRows(table: TableNode): TableRow[] {
  return table.rows.filter((row) => isAllowedAiTableRowPayload(table, row));
}
