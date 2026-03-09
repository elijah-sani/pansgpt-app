'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Database,
  ExternalLink,
  Info,
  LogOut,
  Moon,
  Palette,
  Settings2,
  Sun,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import MobileBottomSheet from '@/components/MobileBottomSheet';
import type { MainUser } from '@/components/main/types';
import {
  CHAT_TEXT_SIZE_KEY,
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

    const savedChatTextSize = window.localStorage.getItem(CHAT_TEXT_SIZE_KEY);
    if (savedChatTextSize === 'small' || savedChatTextSize === 'medium' || savedChatTextSize === 'large') {
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
            <Row title="Web Search" description="Enable web search by default for new chats.">
              <button
                onClick={handleToggleDefaultWebSearch}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                  defaultWebSearchEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
                role="switch"
                aria-checked={defaultWebSearchEnabled}
                aria-label="Toggle default web search"
              >
                <span
                  className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow transition-transform ${
                    defaultWebSearchEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </Row>
            <Row title="Chat text size" description="Adjust the text size used in the chat area.">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
                {(['small', 'medium', 'large'] as ChatTextSize[]).map((size) => (
                  <button
                    key={size}
                    onClick={() => handleChatTextSizeChange(size)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                      chatTextSize === size ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
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
    <div className="relative hidden h-[600px] w-[680px] overflow-hidden rounded-3xl border border-border bg-background shadow-2xl md:flex">
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
        <div className="border-b border-border px-6 py-5">
          <h2 className="text-2xl font-semibold text-foreground">
            {sections.find((section) => section.id === activeSection)?.label}
          </h2>
          {actionError ? <p className="mt-3 text-sm text-destructive">{actionError}</p> : null}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-3">{renderSectionContent(activeSection)}</div>
      </div>
    </div>
  );

  const mobileContent = mobileSection ? (
    <div className="flex min-h-[92vh] flex-col bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <button
          onClick={() => setMobileSection(null)}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <p className="text-sm font-semibold text-foreground">
          {sections.find((section) => section.id === mobileSection)?.label}
        </p>
        <button
          onClick={onClose}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {actionError ? <p className="px-4 pt-3 text-sm text-destructive">{actionError}</p> : null}
      <div className="flex-1 overflow-y-auto px-4 py-4">{renderSectionContent(mobileSection)}</div>
    </div>
  ) : (
    <div className="flex min-h-[92vh] flex-col bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <p className="text-base font-semibold text-foreground">Settings</p>
        <button
          onClick={onClose}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {actionError ? <p className="px-4 pt-3 text-sm text-destructive">{actionError}</p> : null}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-2">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setMobileSection(section.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-left transition-colors hover:bg-muted"
              >
                <Icon className="h-4 w-4 text-primary" />
                <span className="flex-1 text-sm font-medium text-foreground">{section.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <MobileBottomSheet isOpen={isOpen} onClose={onClose} maxHeight="96vh">
        {mobileContent}
      </MobileBottomSheet>

      <div className="fixed inset-0 z-[90] hidden items-center justify-center bg-black/60 p-4 backdrop-blur-sm md:flex" onClick={onClose}>
        <div onClick={(event) => event.stopPropagation()}>{desktopContent}</div>
      </div>

      {isDeleteDialogOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl"
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
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-destructive/40 focus:ring-2 focus:ring-destructive/10"
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
