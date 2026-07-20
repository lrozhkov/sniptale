import type { FieldNode, SectionNode, TableNode } from '@sniptale/runtime-contracts/dom-tree';
import { createLogger } from '@sniptale/platform/observability/logger';
import { isConcatenatedValues } from '../../dom-utils/dom-helpers';

const logger = createLogger({ namespace: 'ContentDomTreeParser:SectionTitles' });

function isGarbageTitle(title: string): boolean {
  if (!title) return true;
  if (title.match(/^Секция\s+\d+$/i)) return true;
  if (isConcatenatedValues(title)) return true;
  if (title.match(/^.+:.+$/) && !title.match(/^.+\s+.+:.+$/)) return true;
  if (title.length < 2) return true;
  return false;
}

function normalizeTitle(title: string): string {
  if (!title) return '';
  let normalized = title.trim();
  normalized = normalized.replace(/\s*Секция\s+\d+\s*$/i, '').trim();
  normalized = normalized.replace(/:$/, '').trim();
  return normalized || title;
}

function inferFieldSectionTitle(fields: FieldNode[]): string | null {
  const fieldLabels = fields.map((field) => field.label.toLowerCase());
  if (fieldLabels.some((label) => label.includes('логин') || label.includes('заблокирован'))) {
    return 'Данные учетной записи';
  }
  if (
    fieldLabels.some(
      (label) => label.includes('активн') || label.includes('время последнего входа')
    )
  ) {
    return 'Данные об активности';
  }
  if (
    fieldLabels.some(
      (label) => label.includes('фамилия') || label.includes('имя') || label.includes('отчество')
    )
  ) {
    return 'Общая информация';
  }
  if (fieldLabels.some((label) => label.includes('лицензия'))) {
    return 'Лицензирование';
  }
  if (fieldLabels.some((label) => label.includes('интеграц') || label.includes('accesskey'))) {
    return 'Для интеграции';
  }

  return null;
}

function inferTableSectionTitle(tables: TableNode[]): string | null {
  const tableHeaders = tables.flatMap((table) =>
    table.headers.map((header) => header.toLowerCase())
  );

  if (
    tableHeaders.some(
      (header) => header.includes('актив') || header.includes('ке') || header.includes('тип актива')
    )
  ) {
    return 'Конфигурационные единицы';
  }

  if (
    tableHeaders.some(
      (header) => header.includes('статус') && tableHeaders.some((inner) => inner.includes('ключ'))
    )
  ) {
    return 'Статус';
  }

  if (
    tableHeaders.includes('автор') ||
    tableHeaders.includes('дата') ||
    tableHeaders.includes('текст')
  ) {
    return 'Комментарии';
  }

  return null;
}

function inferSectionTitle(section: SectionNode): string | null {
  const fields = section.children.filter((child) => child.type === 'field') as FieldNode[];
  const tables = section.children.filter((child) => child.type === 'table') as TableNode[];

  return inferFieldSectionTitle(fields) ?? inferTableSectionTitle(tables);
}

function hasSectionContent(section: SectionNode): boolean {
  return section.children.some((child) => child.type === 'field' || child.type === 'table');
}

export function filterSectionsWithContent(sections: SectionNode[]): SectionNode[] {
  return sections.filter(hasSectionContent);
}

export function mergeSectionsByTitle(filteredSections: SectionNode[]): SectionNode[] {
  const mergedSections: SectionNode[] = [];
  const titleMap = new Map<string, SectionNode>();

  filteredSections.forEach((section) => {
    if (!section.title || isGarbageTitle(section.title)) {
      const inferredTitle = inferSectionTitle(section);
      if (inferredTitle) {
        section.title = inferredTitle;
        logger.debug(`Inferred title for garbage section: ${inferredTitle}`);
      } else if (!hasSectionContent(section)) {
        logger.debug('Skipping empty section');
        return;
      }
    }

    const normalizedTitle = normalizeTitle(section.title);
    const existingSection = titleMap.get(normalizedTitle);
    if (existingSection) {
      existingSection.children.push(...section.children);
      logger.debug(`Merged duplicate section: ${section.title}`);
      return;
    }

    const newSection: SectionNode = {
      ...section,
      title: normalizedTitle,
    };
    mergedSections.push(newSection);
    titleMap.set(normalizedTitle, newSection);
  });

  return mergedSections;
}

export function finalizeSectionTitles(mergedSections: SectionNode[]): void {
  mergedSections.forEach((section) => {
    if (!section.title || isGarbageTitle(section.title)) {
      const inferredTitle = inferSectionTitle(section);
      if (inferredTitle) {
        section.title = inferredTitle;
        logger.debug(`Inferred section title: ${inferredTitle}`);
      }
    }
  });
}
