import { useEffect, useRef } from 'react';
import { type AppLocale, type TranslationKey } from './types';
import { useAppLocale } from './locale/hook';
import { readSourceTranslation } from './translation-reader';

interface PageLocaleMetadata {
  locale: AppLocale;
  title: string;
}

function applyPageLocaleMetadata(metadata: PageLocaleMetadata): void {
  if (document.documentElement.lang !== metadata.locale)
    document.documentElement.lang = metadata.locale;
  if (document.title !== metadata.title) document.title = metadata.title;
}

type MetadataLease = { metadata: PageLocaleMetadata; documentOwner: boolean };
const pageMetadataLeases = new WeakMap<Document, Map<object, MetadataLease>>();

function publishPageMetadata(leases: Map<object, MetadataLease>): void {
  let active: MetadataLease | undefined;
  for (const lease of leases.values()) {
    if (!active || lease.documentOwner || !active.documentOwner) active = lease;
  }
  if (active) applyPageLocaleMetadata(active.metadata);
}

/** Keeps browser metadata synchronized with the active document and locale. */
export function usePageLocaleMetadata(
  titleKey: TranslationKey,
  documentName?: string | null,
  modeKey?: TranslationKey
): AppLocale {
  const locale = useAppLocale();
  const owner = useRef({}).current;

  useEffect(() => {
    let leases = pageMetadataLeases.get(document);
    if (!leases) {
      leases = new Map();
      pageMetadataLeases.set(document, leases);
    }
    leases.set(owner, {
      documentOwner: documentName !== undefined,
      metadata: {
        locale,
        title: documentName?.trim()
          ? [documentName.trim(), modeKey ? readSourceTranslation(locale, modeKey) : null]
              .filter(Boolean)
              .join(' · ')
          : readSourceTranslation(locale, titleKey),
      },
    });
    publishPageMetadata(leases);
  }, [locale, titleKey, documentName, modeKey, owner]);

  useEffect(() => {
    const ownerDocument = document;
    return () => {
      const leases = pageMetadataLeases.get(ownerDocument);
      if (!leases) return;
      leases.delete(owner);
      if (leases.size) publishPageMetadata(leases);
      else pageMetadataLeases.delete(ownerDocument);
    };
  }, [owner]);

  return locale;
}
