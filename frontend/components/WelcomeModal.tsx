'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, BookOpen, BrainCircuit, X } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  firstName: string;
  onClose: () => void;
}

const features = [
  {
    icon: BookOpen,
    color: 'bg-blue-500/10 text-blue-500',
    title: 'Study Mode',
    description: 'Access your full pharmacy curriculum — lecture notes, past questions and study guides — all in one place.',
  },
  {
    icon: BrainCircuit,
    color: 'bg-violet-500/10 text-violet-500',
    title: 'Quiz Yourself',
    description: 'Generate custom quizzes from any topic to test your knowledge before exams.',
  },
  {
    icon: Sparkles,
    color: 'bg-primary/10 text-primary',
    title: 'AI Chat',
    description: 'Ask anything — mechanisms, mnemonics, clinical examples. Your AI study partner.',
  },
];

export default function WelcomeModal({ isOpen, firstName, onClose }: WelcomeModalProps) {
  const [step, setStep] = useState(0);

  const isLastStep = step === features.length - 1;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="relative bg-gradient-to-br from-primary/20 to-primary/5 px-8 pt-10 pb-8 text-center">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-1">
                You're in, {firstName}!
              </h2>
              <p className="text-sm text-muted-foreground">
                Welcome to the Pharmily. Here's what you can do.
              </p>
            </div>

            <div className="px-8 py-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-start gap-4 p-4 rounded-2xl bg-muted/40 border border-border"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${features[step].color}`}>
                    {(() => {
                      const Icon = features[step].icon;
                      return <Icon className="w-5 h-5" />;
                    })()}
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground mb-1">{features[step].title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{features[step].description}</p>
                  </div>
                </motion.div>
              </AnimatePresence>

              <div className="flex justify-center gap-1.5 mt-4">
                {features.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`}
                  />
                ))}
              </div>
            </div>

            <div className="px-8 pb-8 flex gap-3">
              {step > 0 && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="px-4 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Back
                </button>
              )}
              <button
                onClick={() => (isLastStep ? onClose() : setStep((s) => s + 1))}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
              >
                {isLastStep ? "Let's go →" : 'Next'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
