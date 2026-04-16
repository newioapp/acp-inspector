/**
 * Shared Hint component — informational callout card.
 */
import type { ReactNode } from 'react';

export function Hint({
  children,
  className = '',
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <div className={`rounded-md bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground ${className}`}>
      {children}
    </div>
  );
}
