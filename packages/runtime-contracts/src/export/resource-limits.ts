export interface ExportResourceLimits {
  maxFileCount: number;
  maxFileSizeMiB: number;
  maxTotalSizeMiB: number;
}

export const EXPORT_RESOURCE_LIMITS_ABSOLUTE = {
  maxFileCount: 100,
  maxFileSizeMiB: 100,
  maxTotalSizeMiB: 200,
  minFileCount: 1,
  minFileSizeMiB: 1,
  minTotalSizeMiB: 10,
} as const;

export const DEFAULT_EXPORT_RESOURCE_LIMITS: ExportResourceLimits = {
  maxFileCount: 30,
  maxFileSizeMiB: 30,
  maxTotalSizeMiB: 150,
};

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

export function parseExportResourceLimits(value: unknown): ExportResourceLimits | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some(
      (key) => key !== 'maxFileCount' && key !== 'maxFileSizeMiB' && key !== 'maxTotalSizeMiB'
    )
  ) {
    return null;
  }
  const limits = EXPORT_RESOURCE_LIMITS_ABSOLUTE;
  if (
    !isIntegerInRange(record['maxFileCount'], limits.minFileCount, limits.maxFileCount) ||
    !isIntegerInRange(record['maxFileSizeMiB'], limits.minFileSizeMiB, limits.maxFileSizeMiB) ||
    !isIntegerInRange(record['maxTotalSizeMiB'], limits.minTotalSizeMiB, limits.maxTotalSizeMiB)
  ) {
    return null;
  }
  return {
    maxFileCount: record['maxFileCount'],
    maxFileSizeMiB: record['maxFileSizeMiB'],
    maxTotalSizeMiB: record['maxTotalSizeMiB'],
  };
}
