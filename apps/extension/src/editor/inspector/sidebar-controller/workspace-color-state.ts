import { useMemo, useState } from 'react';

interface InspectorWorkspaceColorState {
  error: string | null;
  matchesDefault: boolean;
  pending: boolean;
  setError: (message: string | null) => void;
  setPending: (value: boolean) => void;
}

export function useInspectorWorkspaceColorState(args: {
  currentColor: string;
  defaultColor: string;
}): InspectorWorkspaceColorState {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const matchesDefault = useMemo(
    () => args.currentColor.toLowerCase() === args.defaultColor.toLowerCase(),
    [args.currentColor, args.defaultColor]
  );

  return {
    error,
    matchesDefault,
    pending,
    setError,
    setPending,
  };
}
