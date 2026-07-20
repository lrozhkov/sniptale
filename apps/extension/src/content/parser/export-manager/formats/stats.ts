import type { ExportData, ExportResult } from '@sniptale/runtime-contracts/export';

export function createExportStats(
  data: ExportData | null,
  filesCount: number,
  filesFailed: number
): ExportResult['stats'] {
  const rowsCount =
    data?.sections.reduce(
      (sectionSum, section) =>
        sectionSum +
        (section.tables?.reduce((tableSum, table) => tableSum + table.rows.length, 0) || 0),
      0
    ) || 0;

  return {
    sectionsCount: data?.sections.length || 0,
    rowsCount,
    filesCount,
    filesFailed,
  };
}
