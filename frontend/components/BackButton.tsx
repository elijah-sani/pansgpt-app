"use client";
import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

interface BackButtonProps {
  href: string;
  label?: string;
  className?: string;
}

export default function BackButton({ href, label = "Back", className = "" }: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(href);
  };

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-white rounded-lg transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-green-600 dark:focus:ring-[#00A400] focus:ring-offset-2 bg-white dark:[background-color:#2D3A2D] border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 ${className}`}
    >
      <ArrowLeftIcon className="h-4 w-4" />
      {label}
    </button>
  );
}
