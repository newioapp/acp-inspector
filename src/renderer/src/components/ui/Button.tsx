/**
 * Shared Button component.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'success';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50',
  outline: 'border border-input text-foreground hover:bg-accent disabled:opacity-40',
  ghost: 'text-foreground hover:bg-accent disabled:opacity-40',
  danger: 'bg-destructive text-destructive-foreground hover:opacity-80 disabled:opacity-40',
  success: 'bg-success text-white hover:opacity-80 disabled:opacity-40',
};

export function Button({
  variant = 'outline',
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <button
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
