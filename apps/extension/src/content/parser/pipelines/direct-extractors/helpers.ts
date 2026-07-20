import type { SectionNode } from '@sniptale/runtime-contracts/dom-tree';

function summarizeSectionChild(child: SectionNode['children'][number]) {
  if (child.type === 'field') {
    return {
      contentRole: child.contentRole ?? '',
      label: child.label,
      type: 'field',
      value: child.value,
      valueType: child.valueType,
    };
  }

  return {
    headers: child.headers,
    rows: child.rows.map((row) => row.data),
    type: 'table',
  };
}

function buildSectionMergeKey(section: SectionNode): string {
  return JSON.stringify(
    {
      children: section.children.map(summarizeSectionChild),
      kind: section.kind ?? '',
      title: section.title,
    },
    null,
    0
  );
}

export function mergeDirectExtractionSections(
  currentSections: SectionNode[],
  directSections: SectionNode[]
): SectionNode[] {
  if (directSections.length === 0) {
    return currentSections;
  }

  const directByKey = new Map(
    directSections.map((section) => [buildSectionMergeKey(section), section])
  );
  const merged = currentSections.map((section) => {
    return directByKey.get(buildSectionMergeKey(section)) ?? section;
  });
  const mergedKeys = new Set(merged.map(buildSectionMergeKey));

  directSections.forEach((section) => {
    const key = buildSectionMergeKey(section);
    if (!mergedKeys.has(key)) {
      merged.push(section);
      mergedKeys.add(key);
    }
  });

  return merged;
}
