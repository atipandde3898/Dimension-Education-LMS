import { useState } from 'react';

const BRAND_LOGO_SRC =
  '/assets/aistudio/Dimension-Wordmark-Primary-v1-scaled_6f7bfb78.webp';

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

  const imageHeightClass =
    size === 'sm'
      ? 'h-6 max-w-[190px]'
      : size === 'lg'
        ? 'h-10 sm:h-11 max-w-[320px]'
        : 'h-7 max-w-[205px]';

  const platePaddingClass =
    size === 'sm'
      ? 'px-2 py-1 rounded-lg'
      : size === 'lg'
        ? 'px-4 py-2.5 rounded-xl'
        : 'px-2.5 py-1.5 rounded-lg';

  const plateSurfaceClass =
    variant === 'dark'
      ? 'bg-[#FFFFFF] border border-white/15 shadow-xs'
      : 'bg-[#FFFFFF] border border-[#E3E9F0]/80 dark:border-transparent shadow-2xs';

  const fallbackMarkSizeClass =
    size === 'sm'
      ? 'w-7 h-7 text-xs'
      : size === 'lg'
        ? 'w-10 h-10 text-base'
        : 'w-8 h-8 text-sm';

  const textSizeClass =
    size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base';

  const textColor =
    variant === 'dark' ? 'text-white' : 'text-[#0B1F3A] dark:text-[#E6EDF7]';

  if (logoFailed) {
    return (
      <div className={`inline-flex items-center gap-2.5 ${className}`}>
        <div
          className={`${fallbackMarkSizeClass} rounded-lg bg-[#0FA3A3] text-white flex items-center justify-center font-display font-bold tracking-wide shadow-xs shrink-0 select-none`}
          aria-hidden="true"
        >
          D
        </div>
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

  return (
    <div
      className={`inline-flex items-center ${platePaddingClass} ${plateSurfaceClass} max-w-full ${className}`}
    >
      <img
        src={BRAND_LOGO_SRC}
        alt="Dimension — A Unit of TechOrbit, SAP Gold Partner"
        onError={() => setLogoFailed(true)}
        className={`${imageHeightClass} w-auto object-contain select-none`}
      />
    </div>
  );
}
