import { useRef, useCallback } from 'react';

export function Modal({
  onClose,
  children,
  className = '',
}: {
  readonly onClose: () => void;
  readonly children: React.ReactNode;
  readonly className?: string;
}): React.JSX.Element {
  const backdropRef = useRef<HTMLDivElement>(null);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div
      ref={backdropRef}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div className={className}>{children}</div>
    </div>
  );
}
