import brandGithubIcon from '@iconify-icons/tabler/brand-github';
import { Icon } from '@iconify/react';

export function GitHubIcon({ className }: { className?: string }) {
  return <Icon aria-hidden="true" className={className} icon={brandGithubIcon} />;
}
