import { Globe } from 'lucide-react';
import { useState } from 'react';

import { SelectionSummaryRow } from '../selection/summary-row';

function getOriginFaviconSrc(url: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    return `${new URL(url).origin}/favicon.ico`;
  } catch {
    return null;
  }
}

function getFaviconCandidates(args: { favIconUrl?: string | null; url: string | null }): string[] {
  const candidates = [args.favIconUrl ?? null, getOriginFaviconSrc(args.url)].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );

  return [...new Set(candidates)];
}

function PagesSummaryIcon(props: { favIconUrl?: string | null; url: string | null }) {
  const candidates = getFaviconCandidates(props);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const src = candidates[candidateIndex] ?? null;

  if (!src) {
    return <Globe className="h-3.5 w-3.5 shrink-0 text-[var(--sniptale-color-text-secondary)]" />;
  }

  return (
    <img
      alt=""
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      src={src}
      onError={() => setCandidateIndex((index) => index + 1)}
    />
  );
}

export function PagesSummaryRow(props: {
  favIconUrl?: string | null;
  onRemove: () => void;
  title: string;
  url: string | null;
}) {
  const iconProps =
    props.favIconUrl === undefined
      ? { url: props.url }
      : { favIconUrl: props.favIconUrl, url: props.url };

  return (
    <SelectionSummaryRow
      icon={<PagesSummaryIcon {...iconProps} />}
      label={props.title}
      title={props.title}
      onRemove={props.onRemove}
    />
  );
}
