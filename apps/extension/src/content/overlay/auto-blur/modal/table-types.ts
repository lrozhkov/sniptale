import type { AutoBlurCategory } from '../../../../features/highlighter/contracts/auto-blur';
import type { AutoBlurMatch } from '../../../selection/auto-blur-runtime';

export type AutoBlurTableProps = {
  matches: AutoBlurMatch[];
  selectedCategories: Set<AutoBlurCategory>;
  selectedMatchIds: Set<string>;
  toggleAllSelection: () => void;
  toggleCategory: (category: AutoBlurCategory) => void;
  toggleMatch: (matchId: string) => void;
};
