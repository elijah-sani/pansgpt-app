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
        type="button"
        onClick={onClick}
        title={label}
        className={`w-[54px] h-[54px] rounded-[5px] transition-all flex flex-col items-center justify-center gap-1 select-none p-1 shrink-0 ${
          active
            ? 'bg-accent text-foreground font-medium shadow-xs'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        }`}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <Icon size={20} className="shrink-0" />
        <span className="text-[10px] font-medium leading-none truncate max-w-full text-center tracking-tight">
          {label}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] text-sm font-medium transition-colors select-none ${
        active
          ? 'bg-accent text-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
      }`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <Icon size={20} className="shrink-0" />
      <span>{label}</span>
    </button>
  );
}

export function scoreColor(percentage: number) {
  if (percentage >= 80) return 'text-primary';
  if (percentage >= 60) return 'text-amber-500';
  return 'text-red-500';
}
