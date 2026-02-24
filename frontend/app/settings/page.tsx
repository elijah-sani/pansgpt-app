"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useTheme } from 'next-themes';
import BackButton from '../../components/BackButton';
import {
  Cog6ToothIcon,
  QuestionMarkCircleIcon,
  ChatBubbleLeftRightIcon,
  CreditCardIcon,
  ArrowRightOnRectangleIcon,
  SunIcon,
  MoonIcon
} from '@heroicons/react/24/outline';

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  const [session, setSession] = useState<any>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
    });
  }, []);

  const handleLogout = async () => {
    if (!window.confirm('Are you sure you want to log out?')) {
      return;
    }

    setLoggingOut(true);
    try {
      // Clear device ID from localStorage if it exists
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('deviceId');
      }

      await supabase.auth.signOut();
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
      setLoggingOut(false);
    }
  };

  const menuItems = [
    {
      icon: QuestionMarkCircleIcon,
      title: 'Help & FAQs',
      description: 'Get answers to frequently asked questions',
      onClick: () => router.push('/faq'),
      color: 'text-blue-600 dark:text-blue-400'
    },
    {
      icon: ChatBubbleLeftRightIcon,
      title: 'Feedback',
      description: 'Share your thoughts and suggestions',
      onClick: () => router.push('/feedback'),
      color: 'text-green-600 dark:text-green-400'
    },
    {
      icon: ArrowRightOnRectangleIcon,
      title: 'Logout',
      description: 'Sign out of your account',
      onClick: handleLogout,
      color: 'text-red-600 dark:text-red-400',
      isDanger: true
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:text-white dark:[background-color:#0C120C]">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Back Button */}
        <div className="mb-6">
          <BackButton href="/main" label="Back to Chat" />
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-4 mb-4">
            <div className="p-3 rounded-2xl bg-gray-200 dark:[background-color:#2D3A2D]">
              <Cog6ToothIcon className="h-8 w-8 text-gray-700 dark:text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
              <p className="text-gray-600 dark:text-white/70 mt-1">
                Manage your account and preferences
              </p>
            </div>
          </div>
        </div>

        {/* Settings Menu */}
        <div className="rounded-2xl border overflow-hidden bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10">
          <div className="divide-y divide-gray-200 dark:divide-white/10">
            {/* Theme Toggle */}
            <div className="px-6 py-5 flex items-center gap-4 transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
              onClick={toggleTheme}>
              <div className="p-3 rounded-xl transition-colors bg-green-100 dark:bg-green-900/10">
                {theme === 'light' ? (
                  <SunIcon className="h-6 w-6 transition-colors text-green-600 dark:text-[#00A400]" />
                ) : (
                  <MoonIcon className="h-6 w-6 transition-colors text-green-600 dark:text-[#00A400]" />
                )}
              </div>
              <div className="flex-1 text-left">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Theme
                </h3>
                <p className="text-sm text-gray-600 dark:text-white/70 mt-1">
                  {theme === 'dark' ? 'Dark mode' : 'Light mode'}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTheme();
                }}
                className="relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
                style={{ '--tw-ring-color': '#00A400' } as React.CSSProperties}
                onFocus={(e) => {
                  e.currentTarget.style.outline = '2px solid #00A400';
                  e.currentTarget.style.outlineOffset = '2px';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.outline = '';
                  e.currentTarget.style.outlineOffset = '';
                }}
                role="switch"
                aria-checked={theme === 'dark'}
                aria-label="Toggle theme"
              >
                {/* Track */}
                <span
                  className="absolute h-7 w-12 rounded-full transition-colors duration-300"
                  style={theme === 'dark' ? { backgroundColor: '#00A400' } : { background: 'linear-gradient(to right, #d1d5db, #9ca3af)' }}
                />
                {/* Thumb */}
                <span
                  className={`relative inline-block h-5 w-5 transform rounded-full bg-white transition-all duration-300 ease-in-out ${theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                    }`}
                >
                  {/* Icon inside thumb */}
                  <span className="absolute inset-0 flex items-center justify-center">
                    {theme === 'dark' ? (
                      <MoonIcon className="h-3 w-3" style={{ color: '#00A400' }} />
                    ) : (
                      <SunIcon className="h-3 w-3 text-yellow-500" />
                    )}
                  </span>
                </span>
              </button>
            </div>

            {menuItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={index}
                  onClick={item.onClick}
                  disabled={loggingOut && item.title === 'Logout'}
                  className={`w-full px-6 py-5 flex items-center gap-4 transition-colors ${loggingOut && item.title === 'Logout' ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  style={{ backgroundColor: item.isDanger ? 'transparent' : 'transparent' }}
                  onMouseEnter={(e) => {
                    if (item.isDanger && !loggingOut) {
                      e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 0.1)';
                    } else if (!item.isDanger && !loggingOut) {
                      e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                    }
                  }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <div className={`p-3 rounded-xl ${item.isDanger ? 'bg-red-100 dark:bg-red-900/20' : 'bg-green-100 dark:bg-green-900/10'}`}>
                    <Icon className={`h-6 w-6 ${item.isDanger ? 'text-red-600 dark:text-[#ef4444]' : 'text-green-600 dark:text-[#00A400]'}`} />
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className={`font-semibold ${item.isDanger ? 'text-red-600 dark:text-[#ef4444]' : 'text-gray-900 dark:text-white'}`}>
                      {item.title}
                    </h3>
                    <p className={`text-sm mt-1 ${item.isDanger ? 'text-gray-700 dark:text-white/90' : 'text-gray-600 dark:text-white/70'}`}>
                      {item.description}
                    </p>
                  </div>
                  <svg
                    className={`h-5 w-5 ${item.isDanger ? 'text-red-500 dark:text-red-400/80' : 'text-gray-400 dark:text-white/50'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              );
            })}
          </div>
        </div>

        {/* User Info */}
        {session?.user && (
          <div className="mt-8 rounded-2xl border p-6 bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Account Information</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600 dark:text-white/70">Email</p>
                <p className="text-base text-gray-900 dark:text-white font-medium">{session.user.email}</p>
              </div>
              {session.user.name && (
                <div>
                  <p className="text-sm text-gray-600 dark:text-white/70">Name</p>
                  <p className="text-base text-gray-900 dark:text-white font-medium">{session.user.name}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

