"use client";

import React from 'react';
import { useTheme } from 'next-themes';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';

interface ThemeToggleProps {
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
  const { theme, setTheme } = useTheme();
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const handleToggle = () => {
    console.log('Theme toggle clicked, current theme:', theme);
    toggleTheme();
  };

  const getThemeLabel = () => {
    switch (theme) {
      case 'light':
        return 'Light mode';
      case 'dark':
        return 'Dark mode';
      default:
        return 'Toggle theme';
    }
  };

  const getNextThemeLabel = () => {
    return theme === 'light' ? 'dark mode' : 'light mode';
  };

  return (
    <button
      onClick={handleToggle}
      className={`
        relative p-1.5 rounded-full transition-all duration-300 ease-in-out
        bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700
        border border-gray-200 dark:border-gray-600
        text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white
        focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1
        dark:focus:ring-offset-gray-800
        ${className}
      `}
      title={`Current: ${getThemeLabel()}. Click to switch to ${getNextThemeLabel()}`}
      aria-label={`Current: ${getThemeLabel()}. Click to switch to ${getNextThemeLabel()}`}
    >
      <div className="relative w-4 h-4">
        {/* Light theme icon */}
        <SunIcon
          className={`
            absolute inset-0 w-4 h-4 transition-all duration-300 ease-in-out
            ${theme === 'light'
              ? 'opacity-100 rotate-0 scale-100'
              : 'opacity-0 rotate-90 scale-75'
            }
          `}
        />

        {/* Dark theme icon */}
        <MoonIcon
          className={`
            absolute inset-0 w-4 h-4 transition-all duration-300 ease-in-out
            ${theme === 'dark'
              ? 'opacity-100 rotate-0 scale-100'
              : 'opacity-0 -rotate-90 scale-75'
            }
          `}
        />
      </div>
    </button>
  );
};
