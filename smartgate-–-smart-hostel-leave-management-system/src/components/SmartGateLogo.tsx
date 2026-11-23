import React from 'react';

interface SmartGateLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  darkText?: boolean;
}

export function SmartGateLogo({
  className = '',
  size = 'md',
  showText = true,
  darkText = true,
}: SmartGateLogoProps) {
  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  };

  const textSizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-2xl',
  };

  return (
    <div className={`inline-flex items-center gap-2.5 shrink-0 ${className}`}>
      <svg
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconSizes[size]} shrink-0`}
        aria-hidden="true"
      >
        <rect width="40" height="40" rx="10" fill="#1E3A8A" />
        <path
          d="M11 14C11 12.3431 12.3431 11 14 11H18V15H15V18H11V14Z"
          fill="#FFFFFF"
        />
        <path
          d="M29 14C29 12.3431 27.6569 11 26 11H22V15H25V18H29V14Z"
          fill="#FFFFFF"
        />
        <path
          d="M11 26C11 27.6569 12.3431 29 14 29H18V25H15V22H11V26Z"
          fill="#FFFFFF"
        />
        <path
          d="M29 26C29 27.6569 27.6569 29 26 29H22V25H25V22H29V26Z"
          fill="#93C5FD"
        />
        <rect x="17" y="17" width="6" height="6" rx="1.5" fill="#93C5FD" />
      </svg>
      {showText && (
        <span
          className={`font-bold tracking-tight whitespace-nowrap ${textSizes[size]} ${
            darkText ? 'text-slate-900' : 'text-white'
          }`}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          SmartGate
        </span>
      )}
    </div>
  );
}
