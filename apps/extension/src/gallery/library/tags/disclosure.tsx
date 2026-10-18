import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { useState } from 'react';
import { Tag, X } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { GalleryTagInput } from './input';

interface GalleryTagInputDisclosureProps {
  allTags: string[];
  compact?: boolean;
  excludeTags?: string[];
  explicitSubmit?: boolean;
  expandedClassName?: string;
  onChange: (value: string) => void;
  onSubmit: (tag?: string) => void;
  placeholder: string;
  value: string;
}

export function GalleryTagInputDisclosure(props: GalleryTagInputDisclosureProps) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <ProductActionButton
        tone="secondary"
        compact
        type="button"
        aria-label={translate('gallery.app.addTags')}
        onClick={() => setExpanded(true)}
        className="shrink-0"
      >
        <Tag className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{translate('gallery.app.addTags')}</span>
      </ProductActionButton>
    );
  }

  return (
    <div
      className={`flex min-w-0 items-start gap-1.5 ${props.expandedClassName ?? ''}`}
      data-ui="gallery.tag-editor"
    >
      <div className="min-w-0 flex-1">
        <GalleryTagInput
          {...props}
          autoFocus
          onSubmit={(tag) => {
            props.onSubmit(tag);
            setExpanded(false);
          }}
        />
      </div>
      <ProductActionButton
        tone="secondary"
        compact
        type="button"
        aria-label={translate('gallery.app.closeTagEditor')}
        title={translate('gallery.app.closeTagEditor')}
        onClick={() => setExpanded(false)}
        data-command-chrome="true"
        className="sniptale-dismiss-button h-8 w-8 min-w-8 shrink-0"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </ProductActionButton>
    </div>
  );
}
