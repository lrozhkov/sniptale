import { AppearanceSectionContent } from './content';
import { useAppearanceSection } from './controller';

export function AppearanceSection() {
  const state = useAppearanceSection();
  return <AppearanceSectionContent state={state} />;
}
