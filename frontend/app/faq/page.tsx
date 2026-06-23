"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertCircle,
  ArrowUp,
  BookOpen,
  Brain,
  CircleHelp,
  FileQuestion,
  LineChart,
  Lock,
  MessageSquare,
  Send,
  Sparkles,
} from "lucide-react";
import Navigation from "@/components/landing/Navigation";
import Footer from "@/components/landing/Footer";

type FaqItem = {
  question: string;
  answer: string;
};

type FaqSection = {
  id: string;
  title: string;
  description: string;
  icon: typeof CircleHelp;
  items: FaqItem[];
};

const faqSections: FaqSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    description: "Core questions about what PansGPT is and how to begin using it well.",
    icon: Sparkles,
    items: [
      {
        question: "What is PansGPT?",
        answer:
          "PansGPT is an AI-powered learning platform that combines advanced chat, personalized quizzes, analytics, and document search to help you master your courses. It answers questions, generates quizzes from your materials, and helps track study progress.",
      },
      {
        question: "How do I use the AI chat?",
        answer:
          "Type your question or topic into the chat box on the main page. The AI responds using your uploaded course materials when available, plus general academic knowledge. You can also edit a previous message and the assistant will regenerate the answer from the updated prompt.",
      },
      {
        question: "Can I use PansGPT for any subject?",
        answer:
          "Yes. PansGPT is designed to support academic study across different subjects. Results improve when you upload clear, relevant materials for the specific course you want to study.",
      },
      {
        question: "How do I get the best results from the AI?",
        answer:
          "Upload clean, well-organized materials, ask specific questions, and provide context when something is ambiguous. The quiz and study features work better when your documents are complete and clearly titled.",
      },
    ],
  },
  {
    id: "quizzes",
    title: "Quizzes and Study Tools",
    description: "How quiz generation, grading, and practice behavior work.",
    icon: Brain,
    items: [
      {
        question: "How does quiz generation work?",
        answer:
          "Go to the Quiz page and select your course or topic. PansGPT generates multiple-choice or short-answer questions from your uploaded materials and available course context, while trying to keep them relevant and non-repetitive.",
      },
      {
        question: "How are quizzes graded?",
        answer:
          "Multiple-choice questions are graded automatically. Short-answer responses are evaluated by AI using expected concepts, accuracy, and completeness, and may receive partial credit when the answer is close but incomplete.",
      },
      {
        question: "Why are some quiz questions missing or repeated?",
        answer:
          "Quiz quality depends heavily on the amount and variety of your uploaded materials. If the source material is narrow or repetitive, generated questions may also cluster around the same ideas.",
      },
      {
        question: "What do the analytics and streaks mean?",
        answer:
          "The Analytics page summarizes your study activity, such as questions asked, answers read, documents opened, and your consistency over time. Streaks track consecutive study days.",
      },
      {
        question: "How do achievements work?",
        answer:
          "Achievements unlock as you use the platform more deeply, such as reading documents, taking quizzes, or exploring different study workflows. You can view unlocked badges on your profile.",
      },
    ],
  },
  {
    id: "account-data",
    title: "Account, Profile, and Data",
    description: "Privacy, profile updates, and account-related expectations.",
    icon: Lock,
    items: [
      {
        question: "How do I update my profile?",
        answer:
          "Open your Profile page and choose Edit Profile. You can update your name, level, bio, and profile picture, and changes are reflected across the platform.",
      },
      {
        question: "Is my data private and secure?",
        answer:
          "Your uploaded documents, chat history, and learning activity are intended to remain private to your account and are stored using standard application security controls.",
      },
      {
        question: "How do I reset my password?",
        answer:
          'On the login page, click "Forgot password?" and follow the reset instructions sent to your email.',
      },
    ],
  },
  {
    id: "support",
    title: "Support and Troubleshooting",
    description: "Where to go when answers are wrong, issues appear, or you need help.",
    icon: MessageSquare,
    items: [
      {
        question: "What should I do if the AI gives a wrong or confusing answer?",
        answer:
          "Try rephrasing the question, adding more context, or editing the previous message so the assistant can regenerate with clearer instructions. AI answers can be imperfect, so verification still matters.",
      },
      {
        question: "What browsers and devices are supported?",
        answer:
          "PansGPT works best on current versions of major browsers like Chrome, Edge, and Firefox, and is designed to work on desktop, tablet, and mobile layouts.",
      },
      {
        question: "What if I run into technical issues?",
        answer:
          "Refresh the page first, then sign out and back in if needed. If the issue persists, contact support or report the problem through the app support surfaces.",
      },
      {
        question: "How do I contact support or give feedback?",
        answer:
          "Use the support and feedback options available inside the app. If you need direct help, use the Contact Us entry from the Help or Settings area.",
      },
    ],
  },
];

export default function FaqPage() {
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const quickLinks = useMemo(
    () =>
      faqSections.map((section) => ({
        id: section.id,
        title: section.title,
        icon: section.icon,
      })),
    []
  );

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background dark">
      <Navigation />

      <div className="mx-auto max-w-6xl">
        <section className="px-6 pb-12 pt-32 sm:px-8 lg:px-12">
          <motion.div
            className="space-y-6 text-center"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
            >
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5">
                <FileQuestion className="h-10 w-10 text-primary" />
              </div>
            </motion.div>

            <h1 className="text-5xl text-foreground lg:text-6xl">
              Frequently Asked Questions
            </h1>

            <p className="mx-auto max-w-3xl text-xl text-muted-foreground">
              Clear answers to the questions students ask most about chat, quizzes,
              documents, account settings, and getting support inside PansGPT.
            </p>

            <div className="flex flex-col justify-center gap-4 pt-4 sm:flex-row">
              <Badge className="border-muted-foreground/20 bg-muted-foreground/10 text-muted-foreground">
                <span className="mr-2">Coverage:</span> Chat, Quizzes, Support
              </Badge>
              <Badge className="border-muted-foreground/20 bg-muted-foreground/10 text-muted-foreground">
                <span className="mr-2">Updated:</span> June 23, 2026
              </Badge>
            </div>
          </motion.div>
        </section>

        <section className="px-6 pb-12 sm:px-8 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex gap-4">
                  <AlertCircle className="mt-1 h-6 w-6 shrink-0 text-primary" />
                  <div>
                    <h3 className="mb-2 text-foreground">Before You Ask</h3>
                    <p className="text-muted-foreground">
                      PansGPT works best when your uploaded course materials are clear,
                      complete, and relevant to the question you are asking. If something
                      feels off, it is often a context or source-quality issue rather than
                      only an AI issue.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </section>

        <section className="px-6 pb-12 sm:px-8 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="border-border bg-card">
              <CardContent className="pt-6">
                <h3 className="mb-4 flex items-center gap-2 text-foreground">
                  <BookOpen className="h-5 w-5 text-primary" />
                  Quick Navigation
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {quickLinks.map((item) => (
                    <motion.button
                      key={item.id}
                      onClick={() => scrollToSection(item.id)}
                      className="flex items-center gap-3 rounded-lg border border-transparent bg-muted/50 p-3 text-left transition-colors hover:border-primary/20 hover:bg-primary/10"
                      whileHover={{ x: 5 }}
                      transition={{ duration: 0.2 }}
                    >
                      <item.icon className="h-4 w-4 shrink-0 text-primary" />
                      <span className="text-sm text-muted-foreground">{item.title}</span>
                    </motion.button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </section>

        <section className="space-y-12 px-6 pb-20 sm:px-8 lg:px-12">
          {faqSections.map((section) => (
            <motion.div
              key={section.id}
              id={section.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <section.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-3xl text-foreground">{section.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
                </div>
              </div>

              <Accordion type="single" collapsible className="space-y-4">
                {section.items.map((item, index) => (
                  <AccordionItem
                    key={`${section.id}-${index}`}
                    value={`${section.id}-${index}`}
                    className="rounded-lg border border-border bg-card px-6"
                  >
                    <AccordionTrigger className="text-left text-foreground hover:text-primary">
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="pt-4 text-sm leading-7 text-muted-foreground">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </motion.div>
          ))}

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-2">
                    <h3 className="flex items-center gap-2 text-foreground">
                      <Send className="h-5 w-5 text-primary" />
                      Still need help?
                    </h3>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                      If your issue is not covered here, use the in-app support and contact
                      options. For bug reports, account problems, or product questions, the
                      Help and Settings surfaces will get you to the right support path.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <LineChart className="h-4 w-4 text-primary" />
                    Better questions plus better source material usually produce better answers.
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </section>
      </div>

      <Footer />

      {showScrollTop && (
        <motion.button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-50 rounded-full bg-primary p-3 text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowUp className="h-5 w-5" />
        </motion.button>
      )}
    </div>
  );
}
