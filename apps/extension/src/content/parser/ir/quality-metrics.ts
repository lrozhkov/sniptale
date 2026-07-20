import type { FieldNode, ParsedDocument, SectionNode } from '@sniptale/runtime-contracts/dom-tree';

function isPropertyFieldCounted(
  child: SectionNode['children'][number]
): child is FieldNode & { type: 'field' } {
  return child.type === 'field' && (child.contentRole ?? 'property') === 'property';
}

export function countDuplicatePropertyLabelOverflow(
  documentData: ParsedDocument | SectionNode[],
  overflowThreshold = 3
): number {
  const sections = Array.isArray(documentData) ? documentData : documentData.structure;
  const counts = new Map<string, number>();

  sections.forEach((section) => {
    section.children.forEach((child) => {
      if (!isPropertyFieldCounted(child)) {
        return;
      }

      counts.set(child.label, (counts.get(child.label) ?? 0) + 1);
    });
  });

  return Array.from(counts.values()).reduce((sum, count) => {
    return count > overflowThreshold ? sum + (count - overflowThreshold) : sum;
  }, 0);
}

export function measureBooleanPropertyNoise(documentData: ParsedDocument | SectionNode[]): {
  booleanFields: number;
  isNoisy: boolean;
  totalFields: number;
} {
  const sections = Array.isArray(documentData) ? documentData : documentData.structure;
  let totalFields = 0;
  let booleanFields = 0;

  sections.forEach((section) => {
    section.children.forEach((child) => {
      if (child.type !== 'field') {
        return;
      }

      totalFields += 1;
      if (isPropertyFieldCounted(child) && child.valueType === 'boolean') {
        booleanFields += 1;
      }
    });
  });

  return {
    booleanFields,
    isNoisy: totalFields > 0 && booleanFields >= 8 && booleanFields / totalFields >= 0.35,
    totalFields,
  };
}
