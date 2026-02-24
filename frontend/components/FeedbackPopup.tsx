'use client';

import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface FeedbackPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (feedback: string) => void;
  messageContent?: string;
}

export default function FeedbackPopup({ isOpen, onClose, onSubmit, messageContent }: FeedbackPopupProps) {
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(feedback);
      setFeedback('');
      onClose();
    } catch (error) {
      console.error('Error submitting feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#2D3A2D] rounded-2xl shadow-xl max-w-lg w-full border border-gray-200 dark:border-white/10">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              Help Us Improve
            </h3>
            <button
              onClick={onClose}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
          
          <p className="text-sm text-gray-600 dark:text-white/80 mb-4">
            How can we make PANSGPT's responses better? Your feedback helps us improve the AI's accuracy and helpfulness.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="E.g., The response was too long, missing important details, or could be more specific..."
              className="w-full p-3 rounded-lg border border-gray-300 dark:border-white/20 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-green-600 dark:focus:ring-[#00A400] resize-none"
              rows={4}
              disabled={isSubmitting}
            />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 rounded-lg font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors disabled:opacity-50"
              >
                Skip
              </button>
              <button
                type="submit"
                disabled={!feedback.trim() || isSubmitting}
                className="flex-1 px-4 py-2 rounded-lg font-medium text-white bg-green-600 dark:bg-[#00A400] hover:bg-green-700 dark:hover:bg-[#008300] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

