import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AchievementPopupProps {
  achievement: string;
  isOpen: boolean;
  onClose: () => void;
}

const getAchievementIcon = (achievement: string) => {
  switch (achievement) {
    case "First Document":
      return "📚";
    case "Document Explorer":
      return "🔍";
    case "Document Master":
      return "👑";
    case "Diverse Reader":
      return "🎯";
    case "Knowledge Seeker":
      return "🌟";
    default:
      return "🏆";
  }
};

export default function AchievementPopup({ achievement, isOpen, onClose }: AchievementPopupProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.3 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
          className="fixed bottom-4 right-4 z-50"
        >
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg p-4 max-w-sm w-full border border-white/20">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="text-4xl animate-bounce">
                  {getAchievementIcon(achievement)}
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">Achievement Unlocked!</h3>
                  <p className="text-white/90 text-sm">{achievement}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-white/70 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mt-2 w-full bg-white/20 rounded-full h-1">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 2, ease: "easeInOut" }}
                className="bg-white h-1 rounded-full"
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
} 