import type { ExportSection } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { translate } from '../../../../platform/i18n';
import { getSectionBlocks, getSectionFields } from '../../ir/document-helpers';

type ExportField = NonNullable<ExportSection['fields']>[number];
type NarrativeBlock = ReturnType<typeof getSectionBlocks>[number];
type PlainNarrativeTextBlock = NarrativeBlock & {
  kind: 'quote' | 'callout' | 'code';
};

function createExportField(args: {
  label: string;
  value: string;
  type: ExportField['type'];
  contentRole: ExportField['contentRole'] | undefined;
  linkRef: ExportField['linkRef'] | undefined;
  inlineContent: ExportField['inlineContent'] | undefined;
}): ExportField {
  return {
    label: args.label,
    value: args.value,
    type: args.type,
    ...(args.contentRole === undefined ? {} : { contentRole: args.contentRole }),
    ...(args.linkRef === undefined ? {} : { linkRef: args.linkRef }),
    ...(args.inlineContent === undefined ? {} : { inlineContent: args.inlineContent }),
  };
}

function isPlainNarrativeTextBlock(block: NarrativeBlock): block is PlainNarrativeTextBlock {
  return block.kind === 'quote' || block.kind === 'callout' || block.kind === 'code';
}

function getPlainNarrativeTextLabel(block: PlainNarrativeTextBlock): string {
  return translate(
    block.kind === 'code' ? 'content.runtime.exportCodeLabel' : 'content.runtime.exportTextLabel'
  );
}

function appendNarrativeBlockFields(
  fields: NonNullable<ExportSection['fields']>,
  block: NarrativeBlock
): boolean {
  if (block.kind === 'paragraph' && (block.text || block.inlineContent?.length)) {
    const firstImage = block.inlineContent?.find((node) => node.kind === 'image');
    fields.push(
      createExportField({
        label: translate(
          firstImage && !block.text
            ? 'content.runtime.exportImageLabel'
            : 'content.runtime.exportParagraphLabel'
        ),
        value: block.text || firstImage?.sourceUrl || '',
        type: firstImage && !block.text ? 'image' : 'string',
        contentRole: 'paragraph',
        linkRef: undefined,
        inlineContent: block.inlineContent,
      })
    );
    return true;
  }

  if (block.kind === 'list' && block.items) {
    block.items.forEach((item, index) => {
      fields.push(
        createExportField({
          label: translate('content.runtime.exportListItemLabel'),
          value: item,
          type: 'string',
          contentRole: 'list-item',
          linkRef: undefined,
          inlineContent: block.itemInlineContent?.[index],
        })
      );
    });
    return true;
  }

  if (isPlainNarrativeTextBlock(block) && block.text) {
    fields.push(
      createExportField({
        label: getPlainNarrativeTextLabel(block),
        value: block.text,
        type: 'string',
        contentRole: 'paragraph',
        linkRef: undefined,
        inlineContent: block.inlineContent,
      })
    );
    return true;
  }

  return false;
}

function buildNarrativeFields(tree: ParsedDOMTree, section: ParsedDOMTree['structure'][number]) {
  const blocks = getSectionBlocks(tree, section);
  if (section.kind !== 'narrative' || blocks.length === 0) {
    return null;
  }

  const fields: NonNullable<ExportSection['fields']> = [];

  blocks.forEach((block) => {
    appendNarrativeBlockFields(fields, block);
  });

  return fields.length > 0 ? fields : null;
}

export function buildSectionFields(
  tree: ParsedDOMTree,
  section: ParsedDOMTree['structure'][number]
): NonNullable<ExportSection['fields']> {
  return (
    buildNarrativeFields(tree, section) ??
    getSectionFields(section).map((field) =>
      createExportField({
        label: field.label,
        value: field.value,
        type: field.valueType,
        contentRole: field.contentRole,
        linkRef: field.linkRef,
        inlineContent: undefined,
      })
    )
  );
}
