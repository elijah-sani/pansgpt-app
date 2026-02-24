'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DID_YOU_KNOW_FACTS, DidYouKnowFact } from '@/lib/did-you-know-facts';

interface QuizLoadingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCancel?: () => void;
  isComplete?: boolean;
}

interface ProgressStage {
  id: string;
  title: string;
  description: string;
  duration: number;
  icon: string;
}

const PROGRESS_STAGES: ProgressStage[] = [
  {
    id: 'analyzing',
    title: 'Analyzing Course Content',
    description: 'AI is reviewing your course materials and identifying key concepts...',
    duration: 4000,
    icon: '🔍'
  },
  {
    id: 'generating',
    title: 'Generating Questions',
    description: 'Creating thoughtful questions that test your understanding...',
    duration: 5000,
    icon: '💡'
  },
  {
    id: 'optimizing',
    title: 'Optimizing Difficulty',
    description: 'Balancing question difficulty to match your learning level...',
    duration: 3500,
    icon: '⚖️'
  },
  {
    id: 'reviewing',
    title: 'Quality Review',
    description: 'Ensuring questions are clear, accurate, and educational...',
    duration: 3000,
    icon: '✅'
  },
  {
    id: 'finalizing',
    title: 'Finalizing Quiz',
    description: 'Adding finishing touches and preparing your personalized quiz...',
    duration: 3000,
    icon: '✨'
  }
];

export default function QuizLoadingModal({ isOpen, onClose, onCancel, isComplete = false }: QuizLoadingModalProps) {
  const [currentStage, setCurrentStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentFact, setCurrentFact] = useState<DidYouKnowFact | null>(null);
  const [availableFacts, setAvailableFacts] = useState<DidYouKnowFact[]>([]);
  
  // Use ref to track used facts to avoid infinite re-renders
  const usedFactsRef = useRef<Set<string>>(new Set());

  // Function to get a random fact that hasn't been used recently
  const getRandomFact = (currentAvailableFacts: DidYouKnowFact[]) => {
    // If we've used all facts, reset the used facts set
    if (usedFactsRef.current.size >= currentAvailableFacts.length) {
      usedFactsRef.current.clear();
    }
    
    // Get facts that haven't been used recently
    const unusedFacts = currentAvailableFacts.filter(fact => !usedFactsRef.current.has(fact.id));
    
    // If all facts have been used, use any fact
    const factsToChooseFrom = unusedFacts.length > 0 ? unusedFacts : currentAvailableFacts;
    
    // Get a random fact
    const randomIndex = Math.floor(Math.random() * factsToChooseFrom.length);
    const selectedFact = factsToChooseFrom[randomIndex];
    
    // Mark this fact as used
    usedFactsRef.current.add(selectedFact.id);
    
    return selectedFact;
  };

  useEffect(() => {
    if (!isOpen) {
      // Reset when modal closes
      setCurrentStage(0);
      setProgress(0);
      usedFactsRef.current.clear();
      setAvailableFacts([]);
      setCurrentFact(null);
      return;
    }

    // Initialize available facts and get first random fact
    const facts = [...DID_YOU_KNOW_FACTS];
    setAvailableFacts(facts);
    const firstFact = getRandomFact(facts);
    setCurrentFact(firstFact);

    let stageIndex = 0;
    const totalStages = PROGRESS_STAGES.length;
    const startTime = Date.now();
    
    // Set target duration to 60 seconds (1 minute) to reach 90%
    const targetDuration = 60000; // 60 seconds in milliseconds
    const stageDuration = targetDuration / totalStages; // Each stage gets equal time
    
    // Update progress every 100ms for smooth animation
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      
      // Calculate progress based on elapsed time (60 seconds to reach 90%)
      const maxProgress = isComplete ? 100 : 90;
      let progressPercent = Math.min(elapsed / targetDuration, 1);
      
      // Apply a smoother curve
      progressPercent = Math.pow(progressPercent, 0.8);
      const currentProgress = progressPercent * maxProgress;
      
      setProgress(Math.min(currentProgress, maxProgress));

      // Update current stage based on elapsed time (equal time per stage)
      const newStageIndex = Math.min(Math.floor(elapsed / stageDuration), totalStages - 1);
      
      if (newStageIndex !== stageIndex) {
        stageIndex = newStageIndex;
        setCurrentStage(newStageIndex);
      }

      // Stop if complete or at max progress
      if (currentProgress >= maxProgress) {
        clearInterval(progressInterval);
      }
    }, 100);

    // Change fact every 6 seconds with truly random selection
    const factInterval = setInterval(() => {
      setCurrentFact(prevFact => {
        const randomFact = getRandomFact(facts);
        return randomFact;
      });
    }, 6000);

    return () => {
      clearInterval(progressInterval);
      clearInterval(factInterval);
    };
  }, [isOpen, isComplete]);

  // When quiz is complete, animate to 100%
  useEffect(() => {
    if (isComplete) {
      setProgress(100);
      setCurrentStage(PROGRESS_STAGES.length - 1);
    }
  }, [isComplete]);

  if (!isOpen) return null;

  const currentStageData = PROGRESS_STAGES[currentStage];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          className="rounded-2xl border max-w-2xl w-full max-h-[90vh] overflow-hidden bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10"
        >
          {/* Header */}
          <div className="p-6 border-b border-gray-200 dark:border-white/10">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-green-600 dark:text-[#00A400]">Creating Your Quiz</h2>
              <button
                onClick={onCancel || onClose}
                className="transition-colors text-gray-500 dark:text-white/70 hover:text-gray-700 dark:hover:text-red-500"
                title="Cancel Quiz Generation"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Progress Section */}
            <div className="space-y-4">
              {/* Current Stage */}
              <div className="flex items-center space-x-4">
                <div className="text-4xl">{currentStageData.icon}</div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{currentStageData.title}</h3>
                  <p className="text-gray-600 dark:text-white/70 text-sm">{currentStageData.description}</p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600 dark:text-white/70">
                  <span>Progress</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="w-full rounded-full h-3 overflow-hidden bg-gray-200 dark:bg-black/30">
                  <motion.div
                    className="h-full rounded-full bg-green-600 dark:bg-[#00A400]"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  />
                </div>
              </div>

              {/* Stage Indicators */}
              <div className="flex space-x-2">
                {PROGRESS_STAGES.map((stage, index) => (
                  <div
                    key={stage.id}
                    className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                      index <= currentStage
                        ? 'bg-green-600 dark:bg-[#00A400]'
                        : index === currentStage + 1
                        ? 'bg-green-400 dark:bg-green-600/50'
                        : 'bg-gray-200 dark:bg-white/10'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Did You Know Section */}
            <div className="rounded-xl p-6 border bg-gray-50 dark:bg-black/20 border-gray-200 dark:border-white/10">
              <div className="flex-1">
                <h4 className="text-lg font-semibold mb-4 text-green-600 dark:text-[#00A400]">Did You Know?</h4>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={currentFact?.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.5 }}
                    className="text-gray-900 dark:text-white text-sm leading-relaxed"
                  >
                    {currentFact?.fact}
                  </motion.p>
                </AnimatePresence>
                <div className="mt-4 flex justify-center">
                  <div className="flex space-x-1">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div
                        key={index}
                        className="w-2 h-2 rounded-full animate-pulse bg-gray-400 dark:bg-white/40"
                        style={{ 
                          animationDelay: `${index * 0.2}s` 
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-black/20">
            <div className="flex items-center justify-center space-x-2 text-sm text-gray-600 dark:text-white/70">
              <div className="w-2 h-2 rounded-full animate-pulse bg-green-600 dark:bg-[#00A400]"></div>
              <span>AI is working hard to create the perfect quiz for you...</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}