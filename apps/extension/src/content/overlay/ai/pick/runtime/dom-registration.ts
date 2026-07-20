import type {
  FieldNode,
  ParsedDocument,
  SectionNode,
  TableNode,
} from '@sniptale/runtime-contracts/dom-tree';
import type { AiPickElementIndex } from './dom-index';
import { findElementForTarget, registerFieldElement, registerTableElements } from './dom-targets';
import { getDocumentSections } from '../../../../parser/ir/document-helpers';

function registerSectionChildIds(
  index: AiPickElementIndex,
  sectionElement: HTMLElement,
  section: SectionNode
) {
  const childIds = new Set<string>();
  childIds.add(section.id);

  section.children.forEach((child) => {
    if (child.type === 'field') {
      childIds.add(child.id);
      return;
    }

    if (child.type === 'table') {
      const table = child as TableNode;
      childIds.add(table.id);
      table.rows.forEach((row) => childIds.add(row.id));
    }
  });

  index.elementToDataIds.set(sectionElement, childIds);
}

export function buildElementMaps(
  index: AiPickElementIndex,
  tree: ParsedDocument
): { dataCount: number; elementCount: number } {
  index.dataIdToElement.clear();
  index.elementToDataIds.clear();

  getDocumentSections(tree).forEach((section) => {
    const sectionElement = findElementForTarget(section.id, section.targetRef);
    if (sectionElement) {
      registerSectionChildIds(index, sectionElement, section);
    }

    section.children.forEach((child) => {
      if (child.type === 'field') {
        registerFieldElement(index, child as FieldNode);
        return;
      }

      if (child.type === 'table') {
        registerTableElements(index, child as TableNode);
      }
    });
  });

  return {
    dataCount: index.dataIdToElement.size,
    elementCount: index.elementToDataIds.size,
  };
}
