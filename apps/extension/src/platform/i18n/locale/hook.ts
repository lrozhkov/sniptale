import { useEffect, useState } from 'react';
import { getCurrentLocale, subscribeToLocaleChanges } from './state';
import type { AppLocale } from '../types';

export function useAppLocale(): AppLocale {
  const [locale, setLocale] = useState<AppLocale>(() => getCurrentLocale());

  useEffect(() => subscribeToLocaleChanges(setLocale), []);

  return locale;
}
