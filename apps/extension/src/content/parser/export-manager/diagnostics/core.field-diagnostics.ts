import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

type DuplicateLabelEntry = {
  count: number;
  label: string;
};

type LongValueEntry = {
  label: string;
  length: number;
  sectionTitle: string;
};

export function countRows(treeData: ParsedDOMTree): number {
  return treeData.structure.reduce((sectionSum, section) => {
    return (
      sectionSum +
      section.children.reduce((childSum, child) => {
        return child.type === 'table' && 'rows' in child
          ? childSum + (child as { rows: unknown[] }).rows.length
          : childSum;
      }, 0)
    );
  }, 0);
}

export function collectFieldDiagnostics(treeData: ParsedDOMTree) {
  const duplicateLabels = new Map<string, number>();
  const longestValues: LongValueEntry[] = [];
  let fieldsCount = 0;

  treeData.structure.forEach((section) => {
    section.children.forEach((child) => {
      if (child.type !== 'field') {
        return;
      }

      fieldsCount += 1;
      duplicateLabels.set(child.label, (duplicateLabels.get(child.label) ?? 0) + 1);
      longestValues.push({
        label: child.label,
        length: child.value.length,
        sectionTitle: section.title,
      });
    });
  });

  const topDuplicateLabels: DuplicateLabelEntry[] = [...duplicateLabels.entries()]
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 25)
    .map(([label, count]) => ({ label, count }));

  const topLongestValues = [...longestValues];
  topLongestValues.sort((left, right) => right.length - left.length);

  return {
    fieldsCount,
    topDuplicateLabels,
    topLongestValues: topLongestValues.slice(0, 25),
  };
}
