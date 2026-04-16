/**
 * Shared Dropdown (select-like) component.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface DropdownOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export function Dropdown<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  className = '',
}: {
  readonly options: readonly DropdownOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {selected?.label ?? ''}
        <ChevronDown size={14} className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-card py-1 shadow-md">
          {options.map((o) => (
            <button
              key={o.value}
              className={`flex w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                value === o.value ? 'text-primary font-medium' : 'text-foreground'
              }`}
              onMouseDown={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
