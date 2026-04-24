import type { ElementType } from 'react';

interface SidebarLinkProps {
  icon: ElementType;
  label: string;
  onClick: () => void;
  active?: boolean;
  isIconOnly?: boolean;
}

export function SidebarLink({
  icon: Icon,
  label,
  onClick,
  active,
  isIconOnly,
}: SidebarLinkProps) {
  if (isIconOnly) {
    return (
      <button
        onClick={onClick}
        title={label}
        className={`p-2 rounded-lg transition-colors flex items-center justify-center active:scale-95 active:bg-accent select-none ${
          active ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:text-foreground hover:bg-accent'
        }`}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <Icon size={18} className="shrink-0" />
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors active:scale-[0.98] active:bg-muted/60 select-none ${
        active ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:text-foreground hover:bg-muted/30'
      }`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <Icon size={18} className="shrink-0" />
      <span>{label}</span>
    </button>
  );
}

export function scoreColor(percentage: number) {
  if (percentage >= 80) return 'text-primary';
  if (percentage >= 60) return 'text-amber-500';
  return 'text-red-500';
}
