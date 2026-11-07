'use client';

import React from 'react';
import clsx from 'clsx';
import { UserRound } from 'lucide-react';

const AVATAR_TONES = [
  { bg: 'bg-accent-soft', text: 'text-accent-ink', border: 'border-accent-line' },
  { bg: 'bg-info-soft', text: 'text-info', border: 'border-info-line' },
  { bg: 'bg-success-soft', text: 'text-success', border: 'border-success-line' },
  { bg: 'bg-warning-soft', text: 'text-warning', border: 'border-warning-line' },
  { bg: 'bg-surface-muted', text: 'text-ink', border: 'border-line' },
];

function getToneForString(str?: string) {
  if (!str) return AVATAR_TONES[4];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_TONES.length;
  return AVATAR_TONES[index];
}

export interface AvatarBadgeProps {
  name: string;
  subtitle?: string;
  imageUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showName?: boolean;
  className?: string;
}

export function AvatarBadge({
  name,
  subtitle,
  imageUrl,
  size = 'sm',
  showName = false,
  className,
}: AvatarBadgeProps) {
  const tone = getToneForString(name);

  const sizeClasses = {
    xs: 'h-5 w-5',
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  }[size];
  const iconSize = { xs: 12, sm: 14, md: 18, lg: 22 }[size];

  const avatar = (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full border font-semibold select-none',
        sizeClasses,
        tone.bg,
        tone.text,
        tone.border,
        className
      )}
      title={name}
      aria-label={name}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={name} className="h-full w-full rounded-full object-cover" />
      ) : (
        <UserRound size={iconSize} aria-hidden />
      )}
    </span>
  );

  if (!showName) return avatar;

  return (
    <div className="inline-flex items-center gap-2 min-w-0">
      {avatar}
      <div className="min-w-0 text-left">
        <span className="block truncate text-xs font-semibold text-ink leading-tight">{name}</span>
        {subtitle && (
          <span className="block truncate text-[11px] text-ink-muted leading-tight">{subtitle}</span>
        )}
      </div>
    </div>
  );
}
