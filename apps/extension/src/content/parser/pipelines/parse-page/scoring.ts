import type { FieldNode, ParsedDocument, SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import {
  countDuplicatePropertyLabelOverflow,
  measureBooleanPropertyNoise,
} from '../../ir/quality-metrics';

function scoreField(field: FieldNode): number {
  const contentRole = field.contentRole ?? 'property';
  const valueLength = field.value.trim().length;

  if (contentRole === 'paragraph') {
    return 18 + Math.min(Math.floor(valueLength / 80), 6);
  }

  if (contentRole === 'list-item') {
    return valueLength < 24 ? 1 : 4;
  }

  if (field.valueType === 'boolean') {
    return 1;
  }

  if (field.valueType === 'link') {
    return 6;
  }

  return valueLength < 24 ? 2 : 5;
}

function countBooleanNoisePenalty(sections: SectionNode[], totalFields: number): number {
  const noiseMetrics = measureBooleanPropertyNoise(sections);
  if (!noiseMetrics.isNoisy || totalFields === 0) {
    return 0;
  }

  return noiseMetrics.booleanFields;
}

function countShortListPenalty(sections: SectionNode[]): number {
  return sections.reduce((sum, section) => {
    return (
      sum +
      section.children.reduce((childSum, child) => {
        if (child.type !== 'field' || child.contentRole !== 'list-item') {
          return childSum;
        }

        return child.value.trim().length < 24 ? childSum + 2 : childSum;
      }, 0)
    );
  }, 0);
}

function countPropertyOnlySectionPenalty(sections: SectionNode[]): number {
  return sections.reduce((sum, section) => {
    const fields = section.children.filter((child) => child.type === 'field');
    const tables = section.children.filter((child) => child.type === 'table');
    const paragraphCount = fields.filter((field) => field.contentRole === 'paragraph').length;
    const propertyFields = fields.filter((field) => {
      return (field.contentRole ?? 'property') === 'property';
    });
    const averageValueLength =
      propertyFields.reduce((fieldSum, field) => fieldSum + field.value.trim().length, 0) /
      Math.max(propertyFields.length, 1);

    if (
      tables.length > 0 ||
      paragraphCount > 0 ||
      propertyFields.length < 4 ||
      averageValueLength >= 40
    ) {
      return sum;
    }

    return sum + 12 + propertyFields.length * 2;
  }, 0);
}

function countDuplicateSectionTitlePenalty(sections: SectionNode[]): number {
  const titleCounts = new Map<
    string,
    {
      count: number;
      narrativeCount: number;
    }
  >();

  sections.forEach((section) => {
    const title = section.title.trim();
    if (!title) {
      return;
    }

    const narrativeCount = section.children.filter((child) => {
      return child.type === 'field' && child.contentRole === 'paragraph';
    }).length;
    const existing = titleCounts.get(title);

    if (!existing) {
      titleCounts.set(title, { count: 1, narrativeCount });
      return;
    }

    existing.count += 1;
    existing.narrativeCount += narrativeCount;
  });

  return Array.from(titleCounts.values()).reduce((sum, entry) => {
    if (entry.count < 2) {
      return sum;
    }

    if (entry.narrativeCount >= 2) {
      return sum + (entry.count - 1) * 18;
    }

    return sum + (entry.count - 1) * 8;
  }, 0);
}

export function countDocumentQuality(documentData: ParsedDocument): number {
  const sections = documentData.structure ?? [];
  let totalFields = 0;
  let totalRows = 0;

  const score = sections.reduce((sum, section) => {
    const sectionScore = section.children.reduce((childSum, child) => {
      if (child.type === 'field') {
        totalFields += 1;
        return childSum + scoreField(child);
      }

      totalRows += child.rows.length;
      return childSum + 8 + child.rows.length * 4;
    }, 0);

    return sum + 4 + sectionScore;
  }, 0);

  return (
    score -
    countDuplicateSectionTitlePenalty(sections) -
    countDuplicatePropertyLabelOverflow(sections) * 3 -
    countBooleanNoisePenalty(sections, totalFields) -
    countShortListPenalty(sections) -
    countPropertyOnlySectionPenalty(sections) +
    totalRows
  );
}
