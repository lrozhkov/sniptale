import type {
  DocumentBlock,
  FieldNode,
  SectionNode,
  TargetRef,
} from '@sniptale/runtime-contracts/dom-tree';

function createLegacyField(
  block: DocumentBlock,
  index: number,
  label: string,
  value: string,
  editable: boolean,
  targetRef?: TargetRef,
  contentRole?: 'paragraph' | 'list-item'
): FieldNode {
  return {
    type: 'field',
    id: `${block.id}-field-${index + 1}`,
    label,
    value,
    valueType: 'string',
    selected: true,
    editable,
    ...(contentRole === undefined ? {} : { contentRole }),
    ...(targetRef === undefined ? {} : { targetRef }),
    ...(block.evidence === undefined ? {} : { evidence: block.evidence }),
    ...(block.provenance === undefined ? {} : { provenance: block.provenance }),
  };
}

function appendLegacyParagraphField(
  section: SectionNode,
  block: DocumentBlock,
  index: number,
  label: string
): number {
  if (!block.text) {
    return index;
  }

  section.children.push(
    createLegacyField(
      block,
      index,
      label,
      block.text,
      block.targetRef?.editable ?? false,
      block.targetRef,
      'paragraph'
    )
  );
  return index + 1;
}

function appendLegacyListFields(section: SectionNode, block: DocumentBlock, index: number): number {
  if (!block.items) {
    return index;
  }

  block.items.forEach((item, itemIndex) => {
    section.children.push(
      createLegacyField(
        block,
        index + itemIndex,
        `Список ${index + itemIndex + 1}`,
        item,
        false,
        undefined,
        'list-item'
      )
    );
  });

  return index + block.items.length;
}

export function appendLegacyBlock(
  section: SectionNode,
  block: DocumentBlock,
  index: number
): number {
  if (block.kind === 'paragraph') {
    return appendLegacyParagraphField(section, block, index, `Текст ${index + 1}`);
  }

  if (block.kind === 'list') {
    return appendLegacyListFields(section, block, index);
  }

  if (block.kind === 'quote' || block.kind === 'callout') {
    return appendLegacyParagraphField(section, block, index, `Текст ${index + 1}`);
  }

  if (block.kind === 'code') {
    return appendLegacyParagraphField(section, block, index, `Код ${index + 1}`);
  }

  return index;
}
