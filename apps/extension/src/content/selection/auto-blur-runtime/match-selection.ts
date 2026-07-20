import type { AutoBlurCategory } from '../../../features/highlighter/contracts/auto-blur';
import type { AutoBlurMatch } from './types';

export function isAutoBlurMatchSelected(args: {
  match: AutoBlurMatch;
  selectedCategories: Set<AutoBlurCategory>;
  selectedMatchIds: Set<string>;
}) {
  return args.selectedCategories.has(args.match.category)
    ? !args.selectedMatchIds.has(args.match.id)
    : args.selectedMatchIds.has(args.match.id);
}

export function countSelectedAutoBlurMatches(args: {
  matches: AutoBlurMatch[];
  selectedCategories: Set<AutoBlurCategory>;
  selectedMatchIds: Set<string>;
}) {
  return selectAutoBlurMatches(args).length;
}

export function selectAutoBlurMatches(args: {
  matches: AutoBlurMatch[];
  selectedCategories: Set<AutoBlurCategory>;
  selectedMatchIds: Set<string>;
}) {
  return args.matches.filter(
    (match) =>
      !match.alreadyBlurred &&
      isAutoBlurMatchSelected({
        match,
        selectedCategories: args.selectedCategories,
        selectedMatchIds: args.selectedMatchIds,
      })
  );
}
