type ManagedPresetOrder = {
  customized: boolean;
  id: string;
  order: number;
  origin: 'system' | 'user';
};

export function hasUniqueSequentialPresetOrder(presets: readonly ManagedPresetOrder[]): boolean {
  return (
    new Set(presets.map((preset) => preset.id)).size === presets.length &&
    presets
      .toSorted((left, right) => left.order - right.order)
      .every((preset, order) => preset.order === order)
  );
}

export function restoreManagedPresetOrder<T extends ManagedPresetOrder>(args: {
  copyPending: (preset: T) => T;
  customizedIds: ReadonlySet<string>;
  previous: readonly T[];
  refreshed: T[];
}): T[] {
  let pending: T[] = [];
  let sawAnchor = false;
  for (const preset of args.previous) {
    if (preset.origin === 'user' || (preset.customized && args.customizedIds.has(preset.id))) {
      pending.push(args.copyPending(preset));
      continue;
    }
    const anchor = args.refreshed.findIndex((candidate) => candidate.id === preset.id);
    if (anchor >= 0 && pending.length > 0) {
      args.refreshed.splice(sawAnchor ? anchor : 0, 0, ...pending);
      pending = [];
    }
    if (anchor >= 0) sawAnchor = true;
  }
  args.refreshed.push(...pending);
  return args.refreshed;
}
