import ProfileSidebar from '@/components/ProfileSidebar';
import type { MainUser } from './types';
import { useRef } from 'react';

type MainProfileSidebarProps = {
  isAdmin: boolean;
  isOpen: boolean;
  onClose: () => void;
  onOpenPersonalInfo: () => void;
  onOpenQuizPerformance: () => void;
  onOpenTimetable: () => void;
  user: Exclude<MainUser, null>;
};

export function MainProfileSidebar({
  isAdmin,
  isOpen,
  onClose,
  onOpenPersonalInfo,
  onOpenQuizPerformance,
  onOpenTimetable,
  user,
}: MainProfileSidebarProps) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    if (typeof window === 'undefined' || window.innerWidth >= 768 || !isOpen) {
      return;
    }
    const touch = event.touches[0];
    if (touch) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || typeof window === 'undefined' || window.innerWidth >= 768 || !isOpen) {
      return;
    }
    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (deltaX > 70 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      onClose();
    }
  };

  return (
    <aside
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`fixed inset-y-0 right-0 z-50 w-screen transform transition-transform duration-300 bg-background ${
        isOpen ? 'translate-x-0 md:w-80 md:opacity-100' : 'translate-x-full md:w-0 md:opacity-0'
      } md:relative md:inset-auto md:z-auto md:translate-x-0 md:transition-[width,opacity] md:duration-300 md:ease-in-out md:flex-shrink-0 md:overflow-hidden md:border-l md:border-border`}
    >
      <div className="relative z-50 h-full bg-background">
        <ProfileSidebar
          user={user}
          isAdmin={isAdmin}
          onClose={onClose}
          onOpenTimetable={onOpenTimetable}
          onOpenPersonalInfo={onOpenPersonalInfo}
          onOpenQuizPerformance={onOpenQuizPerformance}
        />
      </div>
    </aside>
  );
}
