'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Home, MessageCircle, Image as ImageIcon, Settings } from 'lucide-react';
import type { ReactNode } from 'react';

interface NavTab {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
  matchPrefix: string;
}

const TABS: NavTab[] = [
  {
    id: 'home',
    label: 'Home',
    icon: <Home className="size-5" />,
    href: '/select',
    matchPrefix: '/select',
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: <MessageCircle className="size-5" />,
    href: '/chat',
    matchPrefix: '/chat',
  },
  {
    id: 'gallery',
    label: 'Gallery',
    icon: <ImageIcon className="size-5" />,
    href: '/gallery',
    matchPrefix: '/gallery',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <Settings className="size-5" />,
    href: '/settings',
    matchPrefix: '/settings',
  },
];

interface BottomNavProps {
  /** Tab id to show red notification badge */
  badgeTab?: string;
}

export function BottomNav({ badgeTab }: BottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  function getActiveTab(): string {
    for (const tab of TABS) {
      if (pathname.startsWith(tab.matchPrefix)) return tab.id;
    }
    return 'home';
  }

  const activeId = getActiveTab();

  return (
    <nav
      className="vm-glass-heavy vm-safe-bottom vm-tap-none flex items-center justify-around border-t px-2 pt-2"
      style={{ borderColor: 'var(--vm-glass-border)' }}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === activeId;
        const hasBadge = tab.id === badgeTab;

        return (
          <button
            key={tab.id}
            onClick={() => router.push(tab.href)}
            className="relative flex flex-col items-center gap-1 px-4 py-1"
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
          >
            {/* Active indicator bar */}
            {isActive && (
              <div
                className="absolute top-[-2px] h-[3px] w-5 rounded-full"
                style={{ background: 'var(--vm-purple-soft)' }}
              />
            )}

            {/* Icon */}
            <div
              className="transition-opacity duration-200"
              style={{
                opacity: isActive ? 1 : 0.5,
                color: isActive ? 'var(--vm-purple-soft)' : 'var(--vm-text-tertiary)',
              }}
            >
              {tab.icon}
            </div>

            {/* Label */}
            <span
              className="text-[10px] font-medium transition-colors duration-200"
              style={{
                color: isActive ? 'var(--vm-purple-soft)' : 'var(--vm-text-tertiary)',
              }}
            >
              {tab.label}
            </span>

            {/* Notification badge */}
            {hasBadge && (
              <div
                className="absolute right-2 top-0 size-2 rounded-full"
                style={{
                  background: 'var(--vm-rose)',
                  border: '2px solid var(--vm-base)',
                }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
