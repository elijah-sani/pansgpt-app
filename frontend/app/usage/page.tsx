"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUp,
  Ban,
  BookOpen,
  FileText,
  GraduationCap,
  Lock,
  Scale,
  Shield,
  UserCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import Navigation from "@/components/landing/Navigation";
import Footer from "@/components/landing/Footer";

export default function UsagePolicyPage() {
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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
                <Shield className="h-10 w-10 text-primary" />
              </div>
            </motion.div>

            <h1 className="text-5xl text-foreground lg:text-6xl">
              PansGPT Usage Policy
            </h1>

            <p className="mx-auto max-w-3xl text-xl text-muted-foreground">
              This policy explains what responsible use of PansGPT looks like, what is prohibited,
              and what actions we may take when the platform is abused.
            </p>

            <div className="flex flex-col justify-center gap-4 pt-4 sm:flex-row">
              <Badge className="border-muted-foreground/20 bg-muted-foreground/10 text-muted-foreground">
                <span className="mr-2">Effective Date:</span> June 22, 2026
              </Badge>
              <Badge className="border-muted-foreground/20 bg-muted-foreground/10 text-muted-foreground">
                <span className="mr-2">Last Revised:</span> June 22, 2026
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
            <Card className="border-amber-500/20 bg-amber-500/10">
              <CardContent className="pt-6">
                <div className="flex gap-4">
                  <AlertTriangle className="mt-1 h-6 w-6 shrink-0 text-amber-500" />
                  <div>
                    <h3 className="mb-2 text-foreground">Important Notice</h3>
                    <p className="text-muted-foreground">
                      This Usage Policy works alongside our Terms of Service and Privacy Policy.
                      By using PansGPT, you agree to follow all three. Violations can lead to content removal,
                      feature restriction, suspension, or account termination.
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
                  {[
                    { id: "purpose", label: "1. Purpose and Scope", icon: FileText },
                    { id: "allowed", label: "2. Allowed Educational Use", icon: GraduationCap },
                    { id: "prohibited", label: "3. Prohibited Use", icon: Ban },
                    { id: "materials", label: "4. Lecturer and Content Rules", icon: Lock },
                    { id: "enforcement", label: "5. Enforcement", icon: Scale },
                    { id: "reporting", label: "6. Reporting and Contact", icon: UserCheck },
                  ].map((item, index) => (
                    <motion.button
                      key={index}
                      onClick={() => scrollToSection(item.id)}
                      className="flex items-center gap-3 rounded-lg border border-transparent bg-muted/50 p-3 text-left transition-colors hover:border-primary/20 hover:bg-primary/10"
                      whileHover={{ x: 5 }}
                      transition={{ duration: 0.2 }}
                    >
                      <item.icon className="h-4 w-4 shrink-0 text-primary" />
                      <span className="text-sm text-muted-foreground">{item.label}</span>
                    </motion.button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </section>

        <section className="space-y-12 px-6 pb-20 sm:px-8 lg:px-12">
          <motion.div
            id="purpose"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-3xl text-foreground">1. Purpose and Scope</h2>
            </div>

            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  PansGPT is an educational platform for studying, revision, document-supported learning,
                  quiz practice, and academic productivity. It is not a medical device, clinical decision system,
                  exam cheating tool, or general-purpose abuse surface.
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            id="allowed"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <GraduationCap className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-3xl text-foreground">2. Allowed Educational Use</h2>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem value="allowed-general" className="rounded-lg border border-border bg-card px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  2.1. What You May Use PansGPT For
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-4 text-muted-foreground">
                  <p className="text-sm">You may use PansGPT for legitimate academic support, including:</p>
                  <ul className="list-disc space-y-2 pl-5 text-sm">
                    <li>explaining concepts, summarizing notes, and revising course material,</li>
                    <li>studying lecturer-approved or institution-approved documents,</li>
                    <li>practicing with quizzes, flash-style questions, and self-assessment tools,</li>
                    <li>organizing notes, extracting study points, and building personal study plans,</li>
                    <li>drafting non-final academic support material that you review and verify yourself.</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="allowed-responsibility" className="rounded-lg border border-border bg-card px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  2.2. Your Responsibility While Using AI Output
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-4 text-muted-foreground">
                  <p className="text-sm">
                    You are responsible for reviewing, verifying, and deciding how to use any output generated by PansGPT.
                    AI output can be incomplete, mistaken, or unsuitable for your exact context.
                  </p>
                  <p className="text-sm">
                    You must not treat generated output as automatically correct simply because it appears confident,
                    detailed, or document-grounded.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </motion.div>

          <motion.div
            id="prohibited"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Ban className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-3xl text-foreground">3. Prohibited Use</h2>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem value="misconduct" className="rounded-lg border border-border bg-card px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  3.1. Academic Misconduct
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-4 text-muted-foreground">
                  <ul className="list-disc space-y-2 pl-5 text-sm">
                    <li>Using PansGPT to cheat on exams, tests, take-home assessments, or restricted coursework.</li>
                    <li>Submitting AI output as your own original work where your school, lecturer, or course rules do not allow it.</li>
                    <li>Using the platform to impersonate another student, lecturer, or administrator.</li>
                    <li>Generating fabricated references, fake lab records, fake attendance records, or false academic claims.</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="clinical" className="rounded-lg border border-border bg-card px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  3.2. Clinical and Safety-Sensitive Use
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-4 text-muted-foreground">
                  <p className="text-sm">
                    You must not use PansGPT for diagnosis, prescribing, treatment selection, dosage confirmation,
                    patient-specific decision making, emergency advice, or any real-world clinical care activity.
                  </p>
                  <p className="text-sm">
                    Educational discussion of clinical topics is allowed. Real-life patient management is not.
                  </p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="abuse" className="rounded-lg border border-border bg-card px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  3.3. Platform Abuse and Harmful Conduct
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-4 text-muted-foreground">
                  <ul className="list-disc space-y-2 pl-5 text-sm">
                    <li>Uploading or generating illegal, fraudulent, threatening, hateful, or abusive content.</li>
                    <li>Trying to bypass restrictions, rate limits, moderation, permissions, or account controls.</li>
                    <li>Scraping, crawling, reverse engineering, or automating the service in ways we do not permit.</li>
                    <li>Sharing accounts, reselling access, or using the platform to build a competing service without permission.</li>
                    <li>Submitting malware, prompt-injection payloads, or attempts to manipulate system behavior beyond intended use.</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </motion.div>

          <motion.div
            id="materials"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Lock className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-3xl text-foreground">4. Lecturer and Content Rules</h2>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem value="uploads" className="rounded-lg border border-border bg-card px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  4.1. Uploading Academic Materials
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-4 text-muted-foreground">
                  <p className="text-sm">
                    Lecturer uploads must be materials you own, control, or are authorized to provide through the platform.
                    Do not upload copyrighted material you do not have the right to distribute or process.
                  </p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="reuse" className="rounded-lg border border-border bg-card px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  4.2. Respecting Institutional and Third-Party Content
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-4 text-muted-foreground">
                  <p className="text-sm">
                    You must not use PansGPT to reproduce, export, or redistribute institutional content in ways that violate
                    copyright, licensing terms, or internal academic rules.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </motion.div>

          <motion.div
            id="enforcement"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Scale className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-3xl text-foreground">5. Enforcement</h2>
            </div>

            <Card className="border-border bg-card">
              <CardContent className="space-y-4 pt-6 text-muted-foreground">
                <p className="text-sm">If we believe this policy has been violated, we may take one or more of the following actions:</p>
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  <li>remove content or block specific outputs,</li>
                  <li>restrict features temporarily or permanently,</li>
                  <li>suspend or terminate an account,</li>
                  <li>preserve logs or evidence for abuse investigation,</li>
                  <li>notify the relevant institution or authority where appropriate and legally justified.</li>
                </ul>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            id="reporting"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <UserCheck className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-3xl text-foreground">6. Reporting and Contact</h2>
            </div>

            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  To report misuse, policy concerns, or copyright-related issues, contact{" "}
                  <a href="mailto:support@pansgpt.site" className="font-medium text-primary hover:underline">
                    support@pansgpt.site
                  </a>.
                  Include enough detail for us to identify the account, content, or action in question.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </section>
      </div>

      {showScrollTop && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
          aria-label="Scroll to top"
        >
          <ArrowUp className="h-5 w-5" />
        </motion.button>
      )}

      <Footer />
    </div>
  );
}
