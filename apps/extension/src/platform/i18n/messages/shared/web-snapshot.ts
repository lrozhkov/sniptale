import { defineMessageSource } from '../source';

export const sharedWebSnapshotProductNameMessage = {
  ru: 'Sniptale Веб-снимок',
  en: 'Sniptale Web Snapshot',
} as const;

export const sharedWebSnapshotSingularNameMessage = {
  ru: 'Веб-снимок',
  en: 'Web Snapshot',
} as const;

export const sharedWebSnapshotPluralNameMessage = {
  ru: 'Веб-снимки',
  en: 'Web Snapshots',
} as const;

export const sharedWebSnapshotMessages = defineMessageSource({
  productName: sharedWebSnapshotProductNameMessage,
  singularName: sharedWebSnapshotSingularNameMessage,
  pluralName: sharedWebSnapshotPluralNameMessage,
});
