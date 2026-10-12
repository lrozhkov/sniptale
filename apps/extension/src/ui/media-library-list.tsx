import type { ReactNode } from 'react';
import {
  SelectableMaterialCard,
  SelectableMaterialGrid,
} from '@sniptale/ui/material-browser/selectable-card';
import { translate } from '../platform/i18n';
/** Presentation only; acquisition, filters and thumbnail lifetime remain with each owner. */
export function MediaLibraryList<T extends { id: string; filename: string }>(props: {
  label: string;
  status: 'loading' | 'ready' | 'failed';
  total: number;
  items: readonly T[];
  emptyLabel: string;
  busy: boolean;
  onRetry(): void;
  onSelect(id: string): void;
  thumbnail(item: T): ReactNode;
}) {
  const status =
    props.status === 'loading' ? (
      <p>{translate('settings.editor.backgrounds.loading')}</p>
    ) : props.status === 'failed' ? (
      <button onClick={props.onRetry}>{translate('settings.editor.backgrounds.retry')}</button>
    ) : props.total === 0 ? (
      <p>{props.emptyLabel}</p>
    ) : props.items.length === 0 ? (
      <p>{translate('settings.editor.backgrounds.noResults')}</p>
    ) : undefined;
  return (
    <SelectableMaterialGrid label={props.label} status={status}>
      {props.items.map((item) => (
        <SelectableMaterialCard
          key={item.id}
          disabled={props.busy}
          title={item.filename}
          onSelect={() => props.onSelect(item.id)}
        >
          {props.thumbnail(item)}
        </SelectableMaterialCard>
      ))}
    </SelectableMaterialGrid>
  );
}
