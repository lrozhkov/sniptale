import type { DesignSystemUsageContext, DesignSystemVariantSpec } from './types';

export function usage(
  usageId: string,
  labelRu: string,
  labelEn: string,
  files: string[],
  status: DesignSystemUsageContext['status'] = 'active'
): DesignSystemUsageContext {
  return { usageId, labelRu, labelEn, files, status };
}

export function variant(
  variantId: string,
  labelRu: string,
  labelEn: string,
  descriptionRu: string,
  descriptionEn: string,
  technicalNotesRu: string[],
  technicalNotesEn: string[]
): DesignSystemVariantSpec {
  return {
    variantId,
    labelRu,
    labelEn,
    descriptionRu,
    descriptionEn,
    technicalNotesRu,
    technicalNotesEn,
  };
}
