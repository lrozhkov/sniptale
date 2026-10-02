import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ContentToolbarButton } from '../content-toolbar';

type MaterialBrowserProps = {
  navigation?: ReactNode;
  search?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
  preview?: ReactNode;
  labels: { list: string; show: string; hide: string };
  className?: string;
  listClassName?: string;
  contentDataUi?: string;
};

/** Shared material layout owns disclosure; catalog, selection and resources remain in adapters. */
export function MaterialBrowser(props: MaterialBrowserProps) {
  const hasPreview = Boolean(props.preview);
  return (
    <div className={`flex min-h-0 min-w-0 flex-1 gap-3 overflow-hidden ${props.className ?? ''}`}>
      {props.navigation && (
        <div className="min-h-0 w-44 shrink-0 overflow-y-auto">{props.navigation}</div>
      )}
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden"
        data-ui={props.contentDataUi}
      >
        {props.search && <div className="shrink-0">{props.search}</div>}
        {props.status}
        <MaterialBrowserList
          hasPreview={hasPreview}
          labels={props.labels}
          listClassName={props.listClassName}
        >
          {props.children}
        </MaterialBrowserList>
        {hasPreview && (
          <div
            className="grid min-h-0 min-w-0 flex-1 overflow-auto"
            data-ui="library-material-preview"
          >
            {props.preview}
          </div>
        )}
      </div>
    </div>
  );
}

/** One results surface owns grid/strip geometry and its disclosure controls. */
function MaterialBrowserList({
  hasPreview,
  labels,
  listClassName,
  children,
}: Pick<MaterialBrowserProps, 'children' | 'labels'> & {
  hasPreview: boolean;
  listClassName: string | undefined;
}) {
  const { listId, list, hidden, toggle } = useMaterialListDisclosure(hasPreview);
  return (
    <>
      {hasPreview && (
        <ContentToolbarButton
          className="self-start"
          aria-expanded={!hidden}
          aria-controls={listId}
          onClick={toggle}
        >
          {hidden ? labels.show : labels.hide}
        </ContentToolbarButton>
      )}
      <div
        ref={list}
        id={listId}
        hidden={hidden}
        aria-label={labels.list}
        data-ui="library-materials-list"
        data-layout={hasPreview ? 'strip' : 'grid'}
        className={[
          'min-h-0 min-w-0 gap-2 overflow-auto p-1',
          hidden ? 'hidden' : 'grid',
          hasPreview
            ? 'max-h-[25%] shrink-0 auto-cols-[220px] grid-flow-col grid-rows-1'
            : 'flex-1 grid-cols-[repeat(auto-fill,minmax(220px,1fr))] content-start',
          listClassName ?? '',
        ].join(' ')}
      >
        {!hidden && children}
      </div>
    </>
  );
}

/** Disclosure preserves scroll coordinates while card resources leave the hidden list. */
function useMaterialListDisclosure(hasPreview: boolean) {
  const listId = useId();
  const list = useRef<HTMLDivElement>(null);
  const scroll = useRef({ left: 0, top: 0 });
  const [collapsed, setCollapsed] = useState(false);
  const hidden = hasPreview && collapsed;
  useLayoutEffect(() => {
    if (!hidden && list.current) {
      list.current.scrollLeft = scroll.current.left;
      list.current.scrollTop = scroll.current.top;
    }
  }, [hidden]);
  const toggle = () => {
    if (!hidden && list.current) {
      scroll.current = { left: list.current.scrollLeft, top: list.current.scrollTop };
    }
    setCollapsed((value) => !value);
  };
  return { listId, list, hidden, toggle };
}
