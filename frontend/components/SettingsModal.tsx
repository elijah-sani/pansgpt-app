'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bug,
  ChevronRight,
  CircleHelp,
  Database,
  ExternalLink,
  FileText,
  Globe,
  Info,
  LogOut,
  Mail,
  Moon,
  Palette,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Type,
  UserRound,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import MobileBottomSheet from '@/components/MobileBottomSheet';
import type { MainUser } from '@/components/main/types';
import {
  CHAT_TEXT_SIZE_LABELS,
  CHAT_TEXT_SIZE_KEY,
  CHAT_TEXT_SIZE_PIXELS,
  CHAT_TEXT_SIZE_STEPS,
  WEB_SEARCH_DEFAULT_KEY,
  dispatchChatTextSizeUpdated,
  dispatchWebSearchDefaultUpdated,
  type ChatTextSize,
} from '@/lib/settings-events';

type SettingsSection = 'general' | 'account' | 'data' | 'about';

type SettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onOpenPersonalInfo: () => void;
  onLogout: () => Promise<void> | void;
  onDeleteAccount: () => Promise<void> | void;
  onClearHistory: () => Promise<void> | void;
  user: Exclude<MainUser, null> | null;
  onOpenReportProblem?: () => void;
};

const sections: Array<{ id: SettingsSection; label: string; icon: typeof Settings2 }> = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'account', label: 'Account', icon: UserRound },
  { id: 'data', label: 'Data', icon: Database },
  { id: 'about', label: 'About', icon: Info },
];

function SectionButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Settings2;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </button>
  );
}

function Row({
  title,
  description,
  children,
  danger = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/40 py-4 last:border-b-0">
      <div className="min-w-0 pr-4">
        <p className={`text-sm font-medium ${danger ? 'text-destructive' : 'text-foreground'}`}>{title}</p>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="shrink-0 self-center">{children}</div>
    </div>
  );
}

export default function SettingsModal({
  isOpen,
  onClose,
  onOpenPersonalInfo,
  onLogout,
  onDeleteAccount,
  onClearHistory,
  user,
  onOpenReportProblem,
}: SettingsModalProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const [mobileSection, setMobileSection] = useState<SettingsSection | null>(null);
  const [logoutConfirming, setLogoutConfirming] = useState(false);
  const [clearConfirming, setClearConfirming] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [busyAction, setBusyAction] = useState<'logout' | 'clear' | 'delete' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [defaultWebSearchEnabled, setDefaultWebSearchEnabled] = useState(false);
  const [chatTextSize, setChatTextSize] = useState<ChatTextSize>('medium');
  const [currentView, setCurrentView] = useState<'settings' | 'textSize'>('settings');

  const getStepFromSize = (size: ChatTextSize): number => {
    const idx = CHAT_TEXT_SIZE_STEPS.indexOf(size);
    return idx === -1 ? 2 : idx + 1;
  };

  const getSizeFromStep = (step: number): ChatTextSize => {
    return CHAT_TEXT_SIZE_STEPS[step - 1] || 'medium';
  };

  const getTextSizeLabel = (step: number): string => {
    return CHAT_TEXT_SIZE_LABELS[getSizeFromStep(step)];
  };

  const getFontSizeCSS = (step: number): string => {
    return CHAT_TEXT_SIZE_PIXELS[getSizeFromStep(step)];
  };

  useEffect(() => {
    if (!isOpen) {
      setActiveSection('general');
      setMobileSection(null);
      setLogoutConfirming(false);
      setClearConfirming(false);
      setIsDeleteDialogOpen(false);
      setDeleteConfirmText('');
      setBusyAction(null);
      setActionError(null);
      setDefaultWebSearchEnabled(false);
      setChatTextSize('medium');
      setCurrentView('settings');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const savedWebSearch = window.localStorage.getItem(WEB_SEARCH_DEFAULT_KEY);
    if (savedWebSearch === 'true' || savedWebSearch === 'false') {
      setDefaultWebSearchEnabled(savedWebSearch === 'true');
    }

    const savedChatTextSize = window.localStorage.getItem(CHAT_TEXT_SIZE_KEY) as ChatTextSize;
    if (CHAT_TEXT_SIZE_STEPS.includes(savedChatTextSize)) {
      setChatTextSize(savedChatTextSize);
    }
  }, [isOpen]);

  const subscriptionLabel = useMemo(() => {
    if (!user?.subscriptionTier || user.subscriptionTier === 'free') {
      return 'Free';
    }
    return user.subscriptionTier === 'pro' ? 'Premium' : user.subscriptionTier;
  }, [user?.subscriptionTier]);

  const themeToggle = (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
        theme === 'dark' ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
      role="switch"
      aria-checked={theme === 'dark'}
      aria-label="Toggle theme"
    >
      <span
        className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow transition-transform ${
          theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
        }`}
      >
        {theme === 'dark' ? <Moon className="h-3 w-3 text-primary" /> : <Sun className="h-3 w-3 text-amber-500" />}
      </span>
    </button>
  );

  const handleLogout = async () => {
    setActionError(null);
    setBusyAction('logout');
    try {
      await onLogout();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to log out right now.');
    } finally {
      setBusyAction(null);
      setLogoutConfirming(false);
    }
  };

  const handleClearHistory = async () => {
    setActionError(null);
    setBusyAction('clear');
    try {
      await onClearHistory();
      setClearConfirming(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to clear chat history right now.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteAccount = async () => {
    setActionError(null);
    setBusyAction('delete');
    try {
      await onDeleteAccount();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to delete your account right now.');
    } finally {
      setBusyAction(null);
      setIsDeleteDialogOpen(false);
    }
  };

  const handleToggleDefaultWebSearch = () => {
    const nextValue = !defaultWebSearchEnabled;
    setDefaultWebSearchEnabled(nextValue);
    window.localStorage.setItem(WEB_SEARCH_DEFAULT_KEY, String(nextValue));
    dispatchWebSearchDefaultUpdated(nextValue);
  };

  const handleChatTextSizeChange = (size: ChatTextSize) => {
    setChatTextSize(size);
    window.localStorage.setItem(CHAT_TEXT_SIZE_KEY, size);
    dispatchChatTextSizeUpdated(size);
  };

  const handleTextSizeStepChange = (step: number) => {
    const size = getSizeFromStep(step);
    handleChatTextSizeChange(size);
  };

  const renderSectionContent = (section: SettingsSection) => {
    switch (section) {
      case 'general':
        return (
          <div>
            <Row
              title="Theme"
              description={`Currently using ${theme === 'dark' ? 'dark mode' : 'light mode'}.`}
            >
              {themeToggle}
            </Row>
            <Row title="Chat text size" description="Adjust the text size used in the chat area.">
              <button
                onClick={() => setCurrentView('textSize')}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Change
                <ChevronRight className="h-4 w-4" />
              </button>
            </Row>
          </div>
        );
      case 'account':
        return (
          <div>
            <Row title="Personal Info" description="Update your avatar, name, level, and university.">
              <button
                onClick={() => {
                  onClose();
                  onOpenPersonalInfo();
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Open
                <ChevronRight className="h-4 w-4" />
              </button>
            </Row>

            <Row title="Subscription Tier" description="Your current plan.">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  user?.subscriptionTier === 'pro'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {subscriptionLabel}
              </span>
            </Row>

            <Row title="Log out" description="Sign out of your account on this device.">
              {logoutConfirming ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLogoutConfirming(false)}
                    className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleLogout()}
                    disabled={busyAction === 'logout'}
                    className="rounded-lg bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {busyAction === 'logout' ? 'Logging out...' : 'Confirm'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setLogoutConfirming(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              )}
            </Row>

            <Row
              title="Delete account"
              description="Permanently delete your account and associated data."
              danger
            >
              <button
                onClick={() => {
                  setActionError(null);
                  setDeleteConfirmText('');
                  setIsDeleteDialogOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90"
              >
                <Trash2 className="h-4 w-4" />
                Delete account
              </button>
            </Row>
          </div>
        );
      case 'data':
        return (
          <div>
            <Row
              title="Clear all chat history"
              description="Delete all saved chat sessions and messages for this account."
              danger
            >
              {clearConfirming ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setClearConfirming(false)}
                    className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleClearHistory()}
                    disabled={busyAction === 'clear'}
                    className="rounded-lg bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {busyAction === 'clear' ? 'Clearing...' : 'Confirm'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setClearConfirming(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Database className="h-4 w-4" />
                  Clear history
                </button>
              )}
            </Row>
          </div>
        );
      case 'about':
        return (
          <div>
            <Row title="App version" description="Current release deployed in this workspace.">
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">1.0.0</span>
            </Row>

            <Row title="Terms of Service" description="Read the current terms for using PansGPT.">
              <button
                onClick={() => router.push('/terms')}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Open
                <ExternalLink className="h-4 w-4" />
              </button>
            </Row>

            <Row title="Privacy Policy" description="Review how your data is handled and protected.">
              <button
                onClick={() => router.push('/privacy')}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Open
                <ExternalLink className="h-4 w-4" />
              </button>
            </Row>
          </div>
        );
      default:
        return null;
    }
  };

  if (!isOpen) {
    return null;
  }

  const desktopContent = (
    <div className="relative hidden h-[600px] w-[680px] overflow-hidden rounded-3xl bg-background shadow-sm md:flex">
      <button
        onClick={onClose}
        className="absolute left-4 top-4 z-10 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="w-[200px] border-r border-border px-4 pb-4 pt-14">
        <div className="space-y-1">
          {sections.map((section) => (
            <SectionButton
              key={section.id}
              active={activeSection === section.id}
              icon={section.icon}
              label={section.label}
              onClick={() => setActiveSection(section.id)}
            />
          ))}
        </div>
      </div>

      <div className="flex h-full flex-1 overflow-hidden flex-col">
        {currentView === 'textSize' && activeSection === 'general' ? (
          <div className="flex h-full flex-col p-6">
            {/* Panel Header with Back Arrow */}
            <div className="flex items-center gap-3 border-b border-border pb-4 mb-4">
              <button 
                onClick={() => setCurrentView('settings')}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h2 className="text-lg font-semibold text-foreground">Text size</h2>
            </div>

            {/* Preview Chat Frame */}
            <div className="flex-1 flex flex-col justify-center gap-3 bg-muted/10 border border-border/60 rounded-2xl p-4 my-2">
              <div className="flex justify-end">
                <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[85%] text-left"
                     style={{ fontSize: getFontSizeCSS(getStepFromSize(chatTextSize)) }}>
                  How do I adjust text size?
                </div>
              </div>
              <div className="flex justify-start">
                <div className="bg-muted text-foreground rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[85%] text-left"
                     style={{ fontSize: getFontSizeCSS(getStepFromSize(chatTextSize)) }}>
                  Try adjusting text size using the slider below!
                </div>
              </div>
            </div>

            {/* Slider Control */}
            <div className="pt-4 pb-2 flex flex-col items-center gap-2">
              <span className="text-xs font-bold text-primary uppercase tracking-wider">
                {getTextSizeLabel(getStepFromSize(chatTextSize))}
              </span>
              <div className="flex items-center gap-3 w-full px-2">
                <span className="text-xs text-muted-foreground font-semibold">A</span>
                <input
                  type="range"
                  min="1"
                  max="4"
                  value={getStepFromSize(chatTextSize)}
                  onChange={(e) => handleTextSizeStepChange(Number(e.target.value))}
                  className="flex-1 h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <span className="text-lg text-muted-foreground font-semibold">A</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-border px-6 py-5">
              <h2 className="text-2xl font-semibold text-foreground">
                {sections.find((section) => section.id === activeSection)?.label}
              </h2>
              {actionError ? <p className="mt-3 text-sm text-destructive">{actionError}</p> : null}
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-3">{renderSectionContent(activeSection)}</div>
          </>
        )}
      </div>
    </div>
  );

  const mobileContent = (
    <div className="flex min-h-[85vh] flex-col bg-background pb-8">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border/40">
        <h2 className="text-lg font-semibold text-foreground">Settings</h2>
        <button
          onClick={onClose}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {actionError ? <p className="px-5 pt-3 text-sm text-destructive">{actionError}</p> : null}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        
        {/* Section 1: Preferences */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2 px-1">Preferences</p>
          <div className="bg-muted/30 dark:bg-muted/15 border border-border/60 rounded-2xl overflow-hidden divide-y divide-border/40">
            {/* Theme Row */}
            <div className="flex items-center justify-between w-full px-4 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {theme === 'dark' ? <Moon className="h-4.5 w-4.5" /> : <Sun className="h-4.5 w-4.5" />}
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-medium text-foreground">Theme</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Currently using {theme === 'dark' ? 'dark mode' : theme === 'light' ? 'light mode' : 'system default'}
                  </p>
                </div>
              </div>
              <div className="shrink-0">{themeToggle}</div>
            </div>

            {/* Text Size Row */}
            <button
              onClick={() => setCurrentView('textSize')}
              className="flex items-center justify-between w-full px-4 py-3.5 hover:bg-muted/20 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Type className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Chat Text Size</p>
                  <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                    Currently: {chatTextSize}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </div>
        </div>

        {/* Section 2: Account */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2 px-1">Account</p>
          <div className="bg-muted/30 dark:bg-muted/15 border border-border/60 rounded-2xl overflow-hidden divide-y divide-border/40">
            {/* Personal Info Row */}
            <button
              onClick={() => {
                onClose();
                onOpenPersonalInfo();
              }}
              className="flex items-center justify-between w-full px-4 py-3.5 hover:bg-muted/20 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <UserRound className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Personal Info</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">
                    {user?.name || user?.email || 'Update your profile information'}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>

            {/* Subscription Row */}
            <div className="flex items-center justify-between w-full px-4 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Sparkles className="h-4.5 w-4.5" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-medium text-foreground">Subscription Tier</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Your current plan</p>
                </div>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  user?.subscriptionTier === 'pro'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted text-muted-foreground border border-border/60'
                }`}
              >
                {subscriptionLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Data & Privacy */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2 px-1">Data & Privacy</p>
          <div className="bg-muted/30 dark:bg-muted/15 border border-border/60 rounded-2xl overflow-hidden divide-y divide-border/40">
            {/* Clear History Row */}
            <div className="flex items-center justify-between w-full px-4 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Database className="h-4.5 w-4.5" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-medium text-foreground">Clear Chat History</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Delete all saved chat sessions</p>
                </div>
              </div>
              <div>
                {clearConfirming ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setClearConfirming(false)}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                    >
                      No
                    </button>
                    <button
                      onClick={() => void handleClearHistory()}
                      disabled={busyAction === 'clear'}
                      className="rounded-lg bg-destructive px-2.5 py-1 text-xs font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {busyAction === 'clear' ? 'Wait...' : 'Yes'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setClearConfirming(true)}
                    className="rounded-lg border border-border/80 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Delete Account Row */}
            <button
              onClick={() => {
                setActionError(null);
                setDeleteConfirmText('');
                setIsDeleteDialogOpen(true);
              }}
              className="flex items-center justify-between w-full px-4 py-3.5 hover:bg-destructive/5 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <Trash2 className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-destructive">Delete Account</p>
                  <p className="text-xs text-destructive/80 mt-0.5">Permanently delete account & data</p>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Help & Support Group */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2 px-1">Help & Support</p>
          <div className="bg-muted/30 dark:bg-muted/15 border border-border/60 rounded-2xl overflow-hidden divide-y divide-border/40">
            {/* Report a Bug */}
            {onOpenReportProblem && (
              <button
                onClick={() => {
                  onClose();
                  onOpenReportProblem();
                }}
                className="flex items-center justify-between w-full px-4 py-3.5 hover:bg-muted/20 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Bug className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Report a Bug</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Let us know if something is broken</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            )}

            {/* FAQ */}
            <button
              onClick={() => {
                onClose();
                router.push('/faq');
              }}
              className="flex items-center justify-between w-full px-4 py-3.5 hover:bg-muted/20 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CircleHelp className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Frequently Asked Questions</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Find answers to common questions</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>

            {/* Contact Us */}
            <button
              onClick={() => {
                onClose();
                router.push('/contact');
              }}
              className="flex items-center justify-between w-full px-4 py-3.5 hover:bg-muted/20 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Mail className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Contact Us</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Get in touch with support</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </div>
        </div>

        {/* Section 4: About */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2 px-1">About</p>
          <div className="bg-muted/30 dark:bg-muted/15 border border-border/60 rounded-2xl overflow-hidden divide-y divide-border/40">
            {/* Version Row */}
            <div className="flex items-center justify-between w-full px-4 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Info className="h-4.5 w-4.5" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-medium text-foreground">App Version</p>
                  <p className="text-xs text-muted-foreground mt-0.5">PansGPT release version</p>
                </div>
              </div>
              <span className="rounded-full bg-muted border border-border/60 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                1.0.0
              </span>
            </div>

            {/* Terms of Service Row */}
            <button
              onClick={() => {
                onClose();
                router.push('/terms');
              }}
              className="flex items-center justify-between w-full px-4 py-3.5 hover:bg-muted/20 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Terms of Service</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Terms for using PansGPT</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>

            {/* Privacy Policy Row */}
            <button
              onClick={() => {
                onClose();
                router.push('/privacy');
              }}
              className="flex items-center justify-between w-full px-4 py-3.5 hover:bg-muted/20 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ShieldCheck className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Privacy Policy</p>
                  <p className="text-xs text-muted-foreground mt-0.5">How your data is protected</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </div>
        </div>

        {/* Log Out Button at the very bottom */}
        <div className="pt-2">
          <div className="bg-muted/30 dark:bg-muted/15 border border-border/60 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between w-full px-4 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <LogOut className="h-4.5 w-4.5" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-medium text-foreground">Log Out</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Sign out on this device</p>
                </div>
              </div>
              <div>
                {logoutConfirming ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setLogoutConfirming(false)}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                    >
                      No
                    </button>
                    <button
                      onClick={() => void handleLogout()}
                      disabled={busyAction === 'logout'}
                      className="rounded-lg bg-destructive px-2.5 py-1 text-xs font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {busyAction === 'logout' ? 'Wait...' : 'Yes'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setLogoutConfirming(true)}
                    className="rounded-lg border border-border/80 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                  >
                    Log out
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );

  const renderMobileTextSizePage = () => (
    <div className="flex min-h-[85vh] flex-col bg-background pb-8">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-4 border-b border-border/40">
        <button
          onClick={() => setCurrentView('settings')}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold text-foreground">Text size</h2>
      </div>

      {/* Preview Chat Frame */}
      <div className="flex-1 flex flex-col justify-center gap-4 px-6 py-8">
        <div className="flex justify-end">
          <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3 max-w-[85%] text-left shadow-sm"
               style={{ fontSize: getFontSizeCSS(getStepFromSize(chatTextSize)) }}>
            How do I adjust text size?
          </div>
        </div>
        <div className="flex justify-start">
          <div className="bg-muted text-foreground rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] text-left shadow-sm"
               style={{ fontSize: getFontSizeCSS(getStepFromSize(chatTextSize)) }}>
            Try adjusting text size using the slider below!
          </div>
        </div>
      </div>

      {/* Slider Control */}
      <div className="pt-6 pb-4 px-6 flex flex-col items-center gap-3 border-t border-border/30 bg-muted/5">
        <span className="text-sm font-bold text-primary uppercase tracking-wider">
          {getTextSizeLabel(getStepFromSize(chatTextSize))}
        </span>
        <div className="flex items-center gap-4 w-full px-2">
          <span className="text-xs text-muted-foreground font-semibold">A</span>
          <input
            type="range"
            min="1"
            max="4"
            value={getStepFromSize(chatTextSize)}
            onChange={(e) => handleTextSizeStepChange(Number(e.target.value))}
            className="flex-1 h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <span className="text-lg text-muted-foreground font-semibold">A</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <MobileBottomSheet isOpen={isOpen} onClose={onClose} maxHeight="96vh" borderless>
        {currentView === 'textSize' ? renderMobileTextSizePage() : mobileContent}
      </MobileBottomSheet>

      <div className="fixed inset-0 z-[90] hidden items-center justify-center bg-black/60 p-4 backdrop-blur-sm md:flex" onClick={onClose}>
        <div onClick={(event) => event.stopPropagation()}>{desktopContent}</div>
      </div>

      {isDeleteDialogOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-sm rounded-2xl bg-card shadow-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-foreground">Delete account</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Type <span className="font-semibold text-foreground">DELETE</span> to confirm permanent account deletion.
              </p>
            </div>
            <div className="space-y-3 px-5 py-4">
              <input
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder="Type DELETE"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base md:text-sm text-foreground outline-none transition-colors focus:border-destructive/40 focus:ring-2 focus:ring-destructive/10"
                autoFocus
              />
              {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <button
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setDeleteConfirmText('');
                }}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDeleteAccount()}
                disabled={deleteConfirmText !== 'DELETE' || busyAction === 'delete'}
                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {busyAction === 'delete' ? 'Deleting...' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
