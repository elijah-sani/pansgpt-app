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
      usedFactsRef.current.clear();
      return;
    }

    // Initialize available facts and get first random fact
    const facts = [...DID_YOU_KNOW_FACTS];
    const initialFactTimeout = window.setTimeout(() => {
      setCurrentFact(getRandomFact(facts));
    }, 0);

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
      setCurrentFact(getRandomFact(facts));
    }, 6000);

    return () => {
      window.clearTimeout(initialFactTimeout);
      clearInterval(progressInterval);
      clearInterval(factInterval);
    };
  }, [isOpen, isComplete]);

  if (!isOpen) return null;

  const displayedProgress = isComplete ? 100 : progress;
  const displayedStage = isComplete ? PROGRESS_STAGES.length - 1 : currentStage;
  const currentStageData = PROGRESS_STAGES[displayedStage];

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
          className="rounded-2xl border max-w-2xl w-full max-h-[90vh] overflow-hidden bg-card border-border"
        >
          {/* Header */}
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-primary dark:text-primary">Creating Your Quiz</h2>
              <button
                onClick={onCancel || onClose}
                className="transition-colors text-muted-foreground hover:text-foreground dark:hover:text-red-400"
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
                  <h3 className="text-lg font-semibold text-foreground">{currentStageData.title}</h3>
                  <p className="text-muted-foreground text-sm">{currentStageData.description}</p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Progress</span>
                  <span>{Math.round(displayedProgress)}%</span>
                </div>
                <div className="w-full rounded-full h-3 overflow-hidden bg-muted/70">
                  <motion.div
                    className="h-full rounded-full bg-primary dark:bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${displayedProgress}%` }}
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
                      index <= displayedStage
                        ? 'bg-primary dark:bg-primary'
                        : index === displayedStage + 1
                        ? 'bg-primary/70 dark:bg-primary/50'
                        : 'bg-muted/70'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Did You Know Section */}
            <div className="rounded-xl p-6 border bg-input-background border-border">
              <div className="flex-1">
                <h4 className="text-lg font-semibold mb-4 text-primary dark:text-primary">Did You Know?</h4>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={currentFact?.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.5 }}
                    className="text-foreground text-sm leading-relaxed"
                  >
                    {currentFact?.fact}
                  </motion.p>
                </AnimatePresence>
                <div className="mt-4 flex justify-center">
                  <div className="flex space-x-1">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div
                        key={index}
                        className="w-2 h-2 rounded-full animate-pulse bg-muted-foreground/60"
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
          <div className="p-6 border-t border-border bg-input-background">
            <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
              <div className="w-2 h-2 rounded-full animate-pulse bg-primary dark:bg-primary"></div>
              <span>AI is working hard to create the perfect quiz for you...</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}


