import { useEffect, useRef, useState } from 'react';
import type {
  CalloutPreset,
  CalloutVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/callout';
import type { AppLocale } from '@sniptale/platform/i18n/config';
import { cloneCalloutVisualStyle } from '../../../features/highlighter/callout-presets/visual-style';
import { getCalloutPresetDisplayName } from '../../../features/highlighter/callout-presets/display-name';

export function useCalloutPresetEditorDraft(args: {
  isOpen: boolean;
  locale: AppLocale;
  source: CalloutPreset;
}) {
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [content, setContent] = useState<CalloutPreset['content']>(args.source.content);
  const [placement, setPlacement] = useState<CalloutPreset['placement']>(args.source.placement);
  const [style, setStyle] = useState<CalloutVisualStyle | null>(null);
  const wasOpenRef = useRef(false);
  const sourceIdRef = useRef<string | null>(null);

  useEffect(() => {
    const didOpen = args.isOpen && !wasOpenRef.current;
    const sourceChanged = sourceIdRef.current !== args.source.id;
    wasOpenRef.current = args.isOpen;
    if (!args.isOpen || (!didOpen && !sourceChanged)) return;
    sourceIdRef.current = args.source.id;
    setName(getCalloutPresetDisplayName(args.source, args.locale));
    setNameTouched(false);
    setContent({ ...args.source.content });
    setPlacement({
      ...args.source.placement,
      ...(args.source.placement.connectorAttachments
        ? {
            connectorAttachments: {
              block: { ...args.source.placement.connectorAttachments.block },
              frame: { ...args.source.placement.connectorAttachments.frame },
            },
          }
        : {}),
    });
    setStyle(cloneCalloutVisualStyle(args.source.style));
  }, [args.isOpen, args.locale, args.source]);

  return {
    name,
    placement,
    preset: style
      ? {
          ...args.source,
          content,
          name: nameTouched ? name : args.source.name,
          placement,
          style,
        }
      : null,
    setName: (value: string) => {
      setName(value);
      setNameTouched(true);
    },
    setContent,
    setPlacement,
    setStyle,
    style,
  };
}
