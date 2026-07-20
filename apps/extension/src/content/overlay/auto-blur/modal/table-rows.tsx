import { useEffect, useRef, type ReactNode } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, CircleDashed } from 'lucide-react';
import type { AutoBlurCategory } from '../../../../features/highlighter/contracts/auto-blur';
import { translate } from '../../../../platform/i18n';
import { isAutoBlurMatchSelected, type AutoBlurMatch } from '../../../selection/auto-blur-runtime';
import { getAutoBlurCategoryLabel } from './category-labels';
import type { AutoBlurTableProps } from './table-types';

function AutoBlurCheckbox(props: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = props.indeterminate ?? false;
  }, [props.indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className="sniptale-checkbox"
      checked={props.checked}
      aria-label={props.label}
      onChange={props.onChange}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

function AutoBlurStatus(props: { alreadyBlurred?: boolean; empty?: boolean }) {
  if (props.empty) {
    return (
      <span title={translate('content.autoBlur.noMatches')}>
        <CircleDashed className="h-4 w-4 text-[var(--sniptale-color-text-muted)]" />
      </span>
    );
  }

  if (props.alreadyBlurred) {
    return (
      <span
        className="inline-flex items-center gap-2 text-xs text-[var(--sniptale-color-success)]"
        title={translate('content.autoBlur.alreadyBlurred')}
      >
        <CheckCircle2 className="h-4 w-4" />
        {translate('content.autoBlur.alreadyBlurred')}
      </span>
    );
  }

  return <span aria-hidden="true" className="block h-4 w-4" />;
}

function AutoBlurChildRow(props: {
  match: AutoBlurMatch;
  selected: boolean;
  toggleMatch: (matchId: string) => void;
}) {
  return (
    <div role="row" className={getChildRowClassName(props)}>
      <AutoBlurCheckbox
        checked={props.selected}
        label={props.match.value}
        onChange={() => props.toggleMatch(props.match.id)}
      />
      <div role="cell" className="w-36 shrink-0 text-xs text-[var(--sniptale-color-text-dim)]">
        {getAutoBlurCategoryLabel(props.match.category)}
      </div>
      <div role="cell" className="min-w-0 flex-1 break-words text-sm leading-5">
        {props.match.value}
      </div>
      <div role="cell" className="w-40 shrink-0">
        <AutoBlurStatus alreadyBlurred={props.match.alreadyBlurred} />
      </div>
    </div>
  );
}

function getChildRowClassName(props: { match: AutoBlurMatch; selected: boolean }) {
  return [
    'sniptale-tree-row sniptale-tree-row-field min-h-9 items-start border-b',
    'border-[var(--sniptale-color-border-subtle)] pl-10',
    props.selected && 'sniptale-tree-row-field-selected',
    props.match.alreadyBlurred && 'opacity-75',
  ]
    .filter(Boolean)
    .join(' ');
}

function getCategorySelectionState(args: {
  category: AutoBlurCategory;
  matches: AutoBlurMatch[];
  selectedCategories: Set<AutoBlurCategory>;
  selectedMatchIds: Set<string>;
}) {
  const selectedCount = args.matches.filter((match) =>
    isAutoBlurMatchSelected({
      match,
      selectedCategories: args.selectedCategories,
      selectedMatchIds: args.selectedMatchIds,
    })
  ).length;
  const selected = args.selectedCategories.has(args.category);
  return {
    indeterminate: selectedCount > 0 && selectedCount < args.matches.length,
    selected,
  };
}

function AutoBlurExpandButton(props: {
  category: AutoBlurCategory;
  expanded: boolean;
  toggleExpanded: (category: AutoBlurCategory) => void;
}) {
  return (
    <button
      type="button"
      className="sniptale-expand-btn"
      onClick={() => props.toggleExpanded(props.category)}
      title={
        props.expanded
          ? translate('content.autoBlur.collapseCategoryTitle')
          : translate('content.autoBlur.expandCategoryTitle')
      }
    >
      {props.expanded ? (
        <ChevronDown className="h-3.5 w-3.5" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function AutoBlurCategoryLabel(props: {
  category: AutoBlurCategory;
  count: number;
  toggleExpanded: (category: AutoBlurCategory) => void;
}) {
  return (
    <button
      type="button"
      role="cell"
      className="flex min-w-0 flex-1 items-center gap-2 text-left"
      onClick={() => props.toggleExpanded(props.category)}
    >
      <span className="font-medium">{getAutoBlurCategoryLabel(props.category)}</span>
      <span className="text-xs text-[var(--sniptale-color-text-dim)]">{props.count}</span>
    </button>
  );
}

function AutoBlurCategoryRow(props: {
  category: AutoBlurCategory;
  expanded: boolean;
  matches: AutoBlurMatch[];
  selectedCategories: Set<AutoBlurCategory>;
  selectedMatchIds: Set<string>;
  toggleCategory: (category: AutoBlurCategory) => void;
  toggleExpanded: (category: AutoBlurCategory) => void;
}) {
  const selectionState = getCategorySelectionState(props);
  const allBlurred =
    props.matches.length > 0 && props.matches.every((match) => match.alreadyBlurred);

  return (
    <div role="row" className={getCategoryRowClassName(selectionState.selected)}>
      <AutoBlurCheckbox
        checked={selectionState.selected}
        indeterminate={selectionState.indeterminate}
        label={getAutoBlurCategoryLabel(props.category)}
        onChange={() => props.toggleCategory(props.category)}
      />
      <AutoBlurExpandButton
        category={props.category}
        expanded={props.expanded}
        toggleExpanded={props.toggleExpanded}
      />
      <AutoBlurCategoryLabel
        category={props.category}
        count={props.matches.length}
        toggleExpanded={props.toggleExpanded}
      />
      <div role="cell" className="w-40 shrink-0">
        <AutoBlurStatus empty={props.matches.length === 0} alreadyBlurred={allBlurred} />
      </div>
    </div>
  );
}

function getCategoryRowClassName(selected: boolean) {
  return [
    'sniptale-tree-row min-h-10 border-b border-[var(--sniptale-color-border-subtle)]',
    selected && 'sniptale-tree-row-selected',
  ]
    .filter(Boolean)
    .join(' ');
}

function renderChildRows(args: {
  matches: AutoBlurMatch[];
  props: AutoBlurTableProps;
}): ReactNode[] {
  return args.matches.map((match) => (
    <AutoBlurChildRow
      key={match.id}
      match={match}
      selected={isAutoBlurMatchSelected({
        match,
        selectedCategories: args.props.selectedCategories,
        selectedMatchIds: args.props.selectedMatchIds,
      })}
      toggleMatch={args.props.toggleMatch}
    />
  ));
}

function getCategoryMatches(matches: AutoBlurMatch[], category: AutoBlurCategory) {
  return matches.filter((match) => match.category === category);
}

export function renderCategoryRows(args: {
  category: AutoBlurCategory;
  expandedCategories: Set<AutoBlurCategory>;
  props: AutoBlurTableProps;
  toggleExpanded: (category: AutoBlurCategory) => void;
}): ReactNode[] {
  const categoryMatches = getCategoryMatches(args.props.matches, args.category);
  const expanded = args.expandedCategories.has(args.category);
  const rows: ReactNode[] = [
    <AutoBlurCategoryRow
      key={args.category}
      category={args.category}
      expanded={expanded}
      matches={categoryMatches}
      selectedCategories={args.props.selectedCategories}
      selectedMatchIds={args.props.selectedMatchIds}
      toggleCategory={args.props.toggleCategory}
      toggleExpanded={args.toggleExpanded}
    />,
  ];

  return expanded
    ? [...rows, ...renderChildRows({ matches: categoryMatches, props: args.props })]
    : rows;
}
