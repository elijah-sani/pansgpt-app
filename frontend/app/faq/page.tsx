'use client';

import React, { useState } from 'react';

const faqs = [
  {
    q: 'What is PansGPT?',
    a: 'PansGPT is an AI-powered learning platform that combines advanced chat, personalized quizzes, analytics, and document search to help you master your courses. It uses state-of-the-art AI to answer your questions, generate quizzes from your materials, and track your progress.'
  },
  {
    q: 'How do I use the AI chat?',
    a: 'Simply type your question or topic into the chat box on the main page. The AI will respond with detailed, context-aware answers, drawing from your uploaded course materials and general academic knowledge. You can edit your previous messages, and the AI will update its response accordingly.'
  },
  {
    q: 'How does quiz generation work?',
    a: 'Go to the Quiz page and select your course or topic. PansGPT will generate a set of multiple-choice or short-answer questions based on your uploaded materials. The AI ensures questions are unique and relevant. You can take quizzes to test your understanding and get instant feedback.'
  },
  {
    q: 'How are quizzes graded?',
    a: "Multiple-choice questions are graded automatically. For short-answer questions, PansGPT uses AI to evaluate your response, considering key concepts, accuracy, and completeness. You'll receive a score and detailed feedback. Partial credit is awarded when your answer is close but not fully correct."
  },
  {
    q: 'What do the analytics and streaks mean?',
    a: "The Analytics page summarizes your learning activity: questions asked, responses read, documents accessed, and your study streak. Streaks show how many consecutive days you've studied, motivating you to keep learning!"
  },
  {
    q: 'How do achievements work?',
    a: 'Achievements are unlocked as you use PansGPT-viewing documents, taking quizzes, or exploring new topics. Each achievement has a unique badge. You can view your unlocked achievements on your profile page.'
  },
  {
    q: 'How do I update my profile?',
    a: 'Go to your Profile page and click "Edit Profile." You can update your name, level, bio, and profile picture. Changes are saved instantly and will be visible across the platform.'
  },
  {
    q: 'Is my data private and secure?',
    a: 'Yes! Your uploaded documents, chat history, and analytics are private and securely stored. Only you can access your data. We use industry-standard security practices to protect your information.'
  },
  {
    q: 'Why are some quiz questions missing or repeated?',
    a: 'Quiz quality depends on the amount and quality of your uploaded materials. If you see repeated or missing questions, try uploading more comprehensive notes or documents. The AI does its best to generate unique, relevant questions each time.'
  },
  {
    q: 'What should I do if the AI gives a wrong or confusing answer?',
    a: 'AI is powerful but not perfect. If you get a confusing answer, try rephrasing your question or providing more context. You can also edit your previous message to clarify, and the AI will update its response.'
  },
  {
    q: 'How do I contact support or give feedback?',
    a: 'Click the three dots in the top right of the main page and select "Feedback." You can send us your suggestions, bug reports, or questions. We value your input and are always working to improve PansGPT!'
  },
  {
    q: 'What browsers and devices are supported?',
    a: 'PansGPT works best on modern browsers like Chrome, Edge, or Firefox, and is fully responsive for use on desktop, tablet, or mobile devices.'
  },
  {
    q: 'How do I reset my password?',
    a: 'On the login page, click "Forgot password?" and follow the instructions. You will receive an email to reset your password securely.'
  },
  {
    q: 'Can I use PansGPT for any subject?',
    a: 'Yes! PansGPT is designed to help with any academic subject. Upload your course materials, ask questions, and generate quizzes for science, engineering, humanities, and more.'
  },
  {
    q: 'How do I get the best results from the AI?',
    a: 'Upload clear, well-organized course materials. Ask specific questions, and use the quiz feature regularly. The more you interact, the better PansGPT can personalize your learning experience.'
  },
  {
    q: 'What if I run into technical issues?',
    a: "Try refreshing the page or logging out and back in. If problems persist, contact support through the Feedback page. We're here to help!"
  },
];

const levels = [
  '100 Level',
  '200 Level',
  '300 Level',
  '400 Level',
  '500 Level',
  '600 Level'
];

const FaqPage = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({ level: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('idle');
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, recipientEmail: 'ojochegbeng@gmail.com' }),
      });
      if (!response.ok) throw new Error('Failed to send question');
      setSubmitStatus('success');
      setFormData({ level: '', message: '' });
      setTimeout(() => {
        setShowDialog(false);
        setSubmitStatus('idle');
      }, 2000);
    } catch {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
        <div className="rounded-2xl p-8 flex flex-col gap-8 border border-border bg-card max-w-2xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-extrabold text-foreground text-center mb-4">PansGPT FAQs</h1>
          <p className="text-lg text-muted-foreground text-center mb-8 max-w-2xl mx-auto">
            Find answers to common questions about using PansGPT for AI chat, quizzes, analytics, and more. If you have a question that is not listed here, reach out via the Feedback page!
          </p>
          <div className="flex flex-col gap-4">
            {faqs.map((faq, idx) => (
              <div key={faq.q} className="rounded-xl border border-border p-4 bg-card">
                <button
                  className="w-full flex justify-between items-center text-left text-lg font-semibold text-foreground focus:outline-none"
                  onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
                  aria-expanded={openIdx === idx}
                >
                  <span>{faq.q}</span>
                  <span className={`ml-2 transition-transform text-primary ${openIdx === idx ? 'rotate-90' : ''}`}>{'>'}</span>
                </button>
                {openIdx === idx && (
                  <div className="mt-3 text-base text-muted-foreground leading-relaxed animate-fade-in">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-8">
            <button
              className="font-bold py-3 px-8 rounded-xl text-lg transition-all duration-200 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setShowDialog(true)}
            >
              Ask a New Question
            </button>
          </div>
        </div>
      </div>
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80">
          <div className="rounded-2xl p-8 w-full max-w-md relative border border-border bg-card">
            <button
              className="absolute top-3 right-3 text-muted-foreground hover:text-destructive text-2xl transition-colors"
              onClick={() => setShowDialog(false)}
              aria-label="Close dialog"
            >
              x
            </button>
            <h2 className="text-2xl font-bold text-foreground mb-4 text-center">Ask a New Question</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="level" className="block text-sm font-medium text-foreground mb-1">Level</label>
                <select
                  id="level"
                  name="level"
                  value={formData.level}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border border-border bg-input-background text-foreground px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                >
                  <option value="">Select your level</option>
                  {levels.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-foreground mb-1">Your Question</label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  rows={4}
                  className="w-full rounded-lg border border-border bg-input-background text-foreground px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none placeholder:text-muted-foreground"
                  placeholder="Enter your question..."
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-lg font-medium text-primary-foreground transition-all bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Sending...' : 'Submit Question'}
              </button>
              {submitStatus === 'success' && (
                <p className="text-center text-primary">Your question was sent successfully!</p>
              )}
              {submitStatus === 'error' && (
                <p className="text-center text-destructive">Failed to send your question. Please try again.</p>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FaqPage;
