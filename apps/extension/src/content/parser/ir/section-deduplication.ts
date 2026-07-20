import type { FieldNode, SectionNode, TableNode } from '@sniptale/runtime-contracts/dom-tree';

const GENERIC_AGGREGATE_SECTION_TITLES = new Set(['Форма', 'Атрибуты']);

type SectionChildNode = SectionNode['children'][number];

function isFieldNode(child: SectionNode['children'][number]): child is FieldNode {
  return child.type === 'field';
}

function buildFieldSignature(field: FieldNode): string {
  return JSON.stringify({
    label: field.label,
    linkRef: field.linkRef ?? '',
    type: field.type,
    value: field.value,
    valueType: field.valueType,
  });
}

function buildTableSignature(table: TableNode): string {
  return JSON.stringify({
    excludedColumns: [...(table.excludedColumns ?? [])].sort(),
    headers: table.headers,
    rows: table.rows.map((row) => ({
      cellTypes: table.headers.map((header) => [header, row.cellTypes?.[header] ?? '']),
      data: table.headers.map((header) => [header, row.data[header] ?? '']),
    })),
    type: table.type,
  });
}

function buildChildSignature(child: SectionChildNode): string {
  return isFieldNode(child) ? buildFieldSignature(child) : buildTableSignature(child);
}

function isGenericAggregateSection(section: SectionNode): boolean {
  return GENERIC_AGGREGATE_SECTION_TITLES.has(section.title.trim());
}

function collectSpecificChildSignatures(sections: SectionNode[]): Set<string> {
  const signatures = new Set<string>();

  sections.forEach((section) => {
    if (isGenericAggregateSection(section)) {
      return;
    }

    section.children.forEach((child) => {
      signatures.add(buildChildSignature(child));
    });
  });

  return signatures;
}

export function dedupeGenericAggregateSectionCopies(sections: SectionNode[]): SectionNode[] {
  const specificChildSignatures = collectSpecificChildSignatures(sections);
  if (specificChildSignatures.size === 0) {
    return sections;
  }

  return sections.flatMap((section) => {
    if (!isGenericAggregateSection(section)) {
      return [section];
    }

    const children = section.children.filter((child) => {
      return !specificChildSignatures.has(buildChildSignature(child));
    });

    return children.length > 0 ? [{ ...section, children }] : [];
  });
}

function buildSectionSignature(section: SectionNode): string {
  return JSON.stringify({
    children: section.children.map(buildChildSignature),
    title: section.title.trim(),
  });
}

export function dedupeRepeatedSections(sections: SectionNode[]): SectionNode[] {
  const seen = new Set<string>();

  return sections.filter((section) => {
    const signature = buildSectionSignature(section);
    if (seen.has(signature)) {
      return false;
    }

    seen.add(signature);
    return true;
  });
}

export function dropEmptySections(sections: SectionNode[]): SectionNode[] {
  return sections.filter((section) => section.children.length > 0);
}
