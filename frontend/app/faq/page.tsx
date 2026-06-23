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
    description: "What PansGPT is, who it is for, and how to get useful answers quickly.",
    icon: Sparkles,
    items: [
      {
        question: "What is PansGPT?",
        answer:
          "PansGPT is a study platform built around your curriculum. It lets you ask course questions, read materials in study mode, generate quizzes from approved notes, and revisit past chats so your learning stays tied to the content you actually use in school.",
      },
      {
        question: "Who is PansGPT built for?",
        answer:
          "PansGPT is designed primarily for students using institution-linked course materials, especially pharmacy-focused study workflows. The product can answer broader academic questions, but it works best when the course, topic, or supporting material is clear.",
      },
      {
        question: "Do I need to upload my own documents before using it?",
        answer:
          "Not always. If your school or lecturer materials have already been added to the library, you can start studying from those. Uploads mainly matter when the course material you need is not yet available in the system.",
      },
      {
        question: "How do I get the best answers from PansGPT?",
        answer:
          "Ask specific questions, mention the concept or course when needed, and keep your prompts focused. PansGPT performs better when the material behind the answer is clear, complete, and relevant to what you are asking.",
      },
    ],
  },
  {
    id: "chat-study",
    title: "Chat and Study Mode",
    description: "How the chat, PDF reader, and chat history work together.",
    icon: BookOpen,
    items: [
      {
        question: "How do I use the AI chat?",
        answer:
          "Open the main chat area, type your question, and send it. PansGPT will answer using relevant course context when available. You can also edit a previous message and regenerate the answer if you want to clarify or correct your prompt.",
      },
      {
        question: "What is Study Mode?",
        answer:
          "Study Mode is the reading flow for course materials. It gives you a cleaner way to read approved documents, move through pages, and switch back into question-asking when you want clarification on what you are studying.",
      },
      {
        question: "Can I ask questions while reading a document?",
        answer:
          "Yes. That is one of the main workflows. You can study a document, move into chat, and ask for explanations, simplifications, or follow-up help based on that material.",
      },
      {
        question: "Can I search past chats?",
        answer:
          "Yes. Chat search can now match both chat titles and message content, so you can find an older conversation even when you only remember a phrase from the actual messages.",
      },
    ],
  },
  {
    id: "quizzes",
    title: "Quizzes and Results",
    description: "How quiz generation, grading, retries, and result feedback behave in the app.",
    icon: Brain,
    items: [
      {
        question: "How does quiz generation work?",
        answer:
          "Go to the Quiz area, choose the course or topic you want, and PansGPT will generate questions from the available course material. The system tries to keep the batch relevant, varied, and tied to what has actually been uploaded or approved.",
      },
      {
        question: "Why does quiz generation sometimes fail or return fewer questions?",
        answer:
          "This usually happens when the available source material is too narrow, too repetitive, or not strong enough to support the requested number of distinct questions. In those cases, trying fewer questions or a more specific topic usually helps.",
      },
      {
        question: "How are quizzes graded?",
        answer:
          "Multiple-choice questions are graded automatically. Short-answer questions are checked by AI against the expected idea, key concepts, and overall correctness, so a response can receive full credit, partial credit, or no credit depending on how close it is.",
      },
      {
        question: "Why do quiz results include explanations?",
        answer:
          "PansGPT is designed to help you learn, not just mark you right or wrong. That is why quiz results include explanations and the correct answer, so you can understand the concept you missed instead of only seeing a score.",
      },
    ],
  },
  {
    id: "account-access",
    title: "Account and Access",
    description: "Profile updates, sign-in issues, and what account-level settings actually do.",
    icon: Lock,
    items: [
      {
        question: "How do I update my profile?",
        answer:
          "Open your profile or account settings area and edit the details you want to change, such as your name, level, or profile image. Changes are reflected across the app once saved.",
      },
      {
        question: "How do I reset my password?",
        answer:
          'Use the "Forgot password?" option on the login page and follow the email reset flow. If the email does not arrive, check spam first and then contact support.',
      },
      {
        question: "Can I clear my chat history?",
        answer:
          "Yes. The settings area includes an option to clear saved chat history. This is separate from deleting your account.",
      },
      {
        question: "Can I delete my account from inside the app?",
        answer:
          "Yes. There is a delete-account action in the settings area. Because it is permanent, the app asks you to confirm before continuing.",
      },
    ],
  },
  {
    id: "support",
    title: "Support, Privacy, and Troubleshooting",
    description: "Where answers come from, what to do when something looks wrong, and how to get help.",
    icon: MessageSquare,
    items: [
      {
        question: "What should I do if an answer looks wrong or confusing?",
        answer:
          "Ask a more specific follow-up, mention the exact concept or document section, or edit your last message and regenerate the response. If the answer still looks wrong, verify it against your course material and report the issue.",
      },
      {
        question: "Does PansGPT search the open internet for answers?",
        answer:
          "PansGPT is built primarily around your curriculum and approved study material rather than random internet content. That means the best answers usually come from what has been added to the learning system, not from broad public web search.",
      },
      {
        question: "Is my data private?",
        answer:
          "Your chats, study activity, and account data are intended to stay tied to your account and app permissions. Document and content visibility depend on how materials are managed inside your school or institution context.",
      },
      {
        question: "How do I contact support?",
        answer:
          "Use the Contact Us entry in Help or Settings. In the current app flow, that opens the support WhatsApp link directly, which is the fastest route for product questions, account help, or bug reports.",
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
              Clear answers to the questions users actually ask about chat, study mode,
              quizzes, account access, and support inside the current PansGPT app.
            </p>

            <div className="flex flex-col justify-center gap-4 pt-4 sm:flex-row">
              <Badge className="border-muted-foreground/20 bg-muted-foreground/10 text-muted-foreground">
                <span className="mr-2">Coverage:</span> Chat, Study Mode, Quizzes, Support
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
                      PansGPT gives stronger answers when your question is specific and the
                      course material behind it is available and relevant. Most weak answers
                      come from vague prompts, thin source material, or asking for more variety
                      than the available documents can support.
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
                      If your issue is not covered here, use the Contact Us entry in Help or
                      Settings. That support path is better for bug reports, access issues,
                      quiz problems, or questions about how the app should behave.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <LineChart className="h-4 w-4 text-primary" />
                    Specific questions plus better source material usually produce better answers.
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
