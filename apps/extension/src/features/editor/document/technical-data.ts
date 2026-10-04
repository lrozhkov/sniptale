const technicalDataKinds = ['url', 'date', 'browser'] as const;

export type EditorTechnicalDataKind = (typeof technicalDataKinds)[number];
export type EditorTechnicalDataLayout = 'column' | 'row';

export function orderTechnicalDataKinds(
  kinds: readonly EditorTechnicalDataKind[]
): EditorTechnicalDataKind[] {
  const selectedKinds = new Set(kinds);

  return technicalDataKinds.filter((kind) => selectedKinds.has(kind));
}
