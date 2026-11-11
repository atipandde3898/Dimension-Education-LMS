import { useState } from 'react';

interface BrandLogoProps {
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
  className?: string;
}

export function BrandLogo({
  variant = 'dark',
  size = 'md',
  showName = true,
  className = '',
}: BrandLogoProps) {
  const [logoFailed, setLogoFailed] = useState(false);

  const markSizeClass =
    size === 'sm'
      ? 'w-7 h-7 text-xs'
      : size === 'lg'
        ? 'w-10 h-10 text-base'
        : 'w-8 h-8 text-sm';

  const textSizeClass =
    size === 'sm'
      ? 'text-sm'
      : size === 'lg'
        ? 'text-xl'
        : 'text-base';

  const textColor =
    variant === 'dark' ? 'text-white' : 'text-[#0B1F3A] dark:text-[#E6EDF7]';

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* Logo slot with fallback */}
      {!logoFailed ? (
        <img
          src="/logo.svg"
          alt="Dimension Education"
          onError={(e) => {
            const target = e.currentTarget;
            if (target.src.endsWith('/logo.svg')) {
              target.src = '/logo.png';
            } else {
              setLogoFailed(true);
            }
          }}
          className={`${markSizeClass} object-contain rounded-lg`}
        />
      ) : (
        <div
          className={`${markSizeClass} rounded-lg bg-[#0FA3A3] text-white flex items-center justify-center font-display font-bold tracking-wide shadow-xs shrink-0 select-none`}
          aria-hidden="true"
        >
          D
        </div>
      )}

      {showName && (
        <span
          className={`font-display font-bold tracking-tight ${textSizeClass} ${textColor} whitespace-nowrap`}
        >
          Dimension Education
        </span>
      )}
    </div>
  );
}
