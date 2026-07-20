import { useEffect, useState } from 'react';

export function useRangeDraftValue(value: number) {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  return [draftValue, setDraftValue] as const;
}
