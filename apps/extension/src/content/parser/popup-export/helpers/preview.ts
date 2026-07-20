import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type { PopupExportPreview } from '@sniptale/runtime-contracts/export';
import { convertTreeToMarkdown } from '../../dom-tree-parser/ai/format';

function countRows(tree: ParsedDOMTree): number {
  return tree.structure.reduce((rowsCount, section) => {
    return (
      rowsCount +
      section.children.reduce((sectionRows, child) => {
        return child.type === 'table' && 'rows' in child
          ? sectionRows + (child as { rows: unknown[] }).rows.length
          : sectionRows;
      }, 0)
    );
  }, 0);
}

export function buildPopupExportPreview(tree: ParsedDOMTree): PopupExportPreview {
  return {
    title: tree.title,
    context: tree.context,
    jsonPreview: JSON.stringify(tree, null, 2),
    markdownPreview: convertTreeToMarkdown(tree),
    sectionsCount: tree.structure.length,
    rowsCount: countRows(tree),
  };
}
