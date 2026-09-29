import { AppearanceSectionContent } from './content';
import { useAppearanceSection } from './controller';

export function AppearanceSection(props: { onViewChange?: (view: string) => void; view?: string }) {
  const state = useAppearanceSection();
  return <AppearanceSectionContent state={state} {...props} />;
}
