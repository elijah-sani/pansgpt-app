import ProfileSidebar from '@/components/ProfileSidebar';
import type { MainUser } from './types';

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
  return (
    <aside
      className={`fixed inset-y-0 right-0 z-50 w-screen transform transition-transform duration-300 bg-background border-l border-border ${
        isOpen ? 'translate-x-0 md:w-80 md:opacity-100' : 'translate-x-full md:w-0 md:opacity-0'
      } md:relative md:inset-auto md:z-auto md:translate-x-0 md:transition-[width,opacity] md:duration-300 md:ease-in-out md:flex-shrink-0 md:overflow-hidden`}
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
