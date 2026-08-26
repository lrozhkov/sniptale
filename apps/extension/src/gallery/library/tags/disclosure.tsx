import { useState } from 'react';
import { Tag, X } from 'lucide-react';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
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
      <button
        type="button"
        aria-label={translate('gallery.app.addTags')}
        onClick={() => setExpanded(true)}
        className={`${getControlSecondaryButtonClassName({ density: 'compact' })}
          !h-8 !min-h-8 !rounded-[8px] !px-2.5`}
      >
        <Tag className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{translate('gallery.app.addTags')}</span>
      </button>
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
      <button
        type="button"
        aria-label={translate('gallery.app.closeTagEditor')}
        title={translate('gallery.app.closeTagEditor')}
        onClick={() => setExpanded(false)}
        className={`${getControlSecondaryButtonClassName({ density: 'compact' })}
          !h-8 !min-h-8 !w-8 !min-w-8 !rounded-[8px] !p-0`}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
