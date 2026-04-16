/**
 * Shared Label component.
 */
import type { ReactNode } from 'react';

export function Label({
  text,
  hint,
  children,
  className = '',
}: {
  readonly text: string;
  readonly hint?: string;
  readonly children: ReactNode;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <label className={`mb-4 block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{text}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
