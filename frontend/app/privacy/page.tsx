"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { motion } from "framer-motion";
import {
    Shield,
    FileText,
    Scale,
    AlertTriangle,
    BookOpen,
    Lock,
    CheckCircle,
    XCircle,
    ArrowUp,
    Brain,
    Database,
    Eye,
    UserCheck,
    Mail
} from "lucide-react";
import { useState, useEffect } from "react";
import Navigation from "@/components/landing/Navigation";
import Footer from "@/components/landing/Footer";

export default function PrivacyPage() {
    const [showScrollTop, setShowScrollTop] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setShowScrollTop(window.scrollY > 400);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const scrollToSection = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    return (
        <div className="min-h-screen bg-background dark">
            {/* Navigation */}
            <Navigation />

            {/* Main Content Wrapper */}
            <div className="max-w-6xl mx-auto">
                {/* Hero Section */}
                <section className="pt-32 pb-12 px-6 sm:px-8 lg:px-12">
                    <motion.div
                        className="text-center space-y-6"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.2 }}
                        >
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto mb-6">
                                <Shield className="w-10 h-10 text-primary" />
                            </div>
                        </motion.div>

                        <h1 className="text-5xl lg:text-6xl text-foreground">
                            PANSGPT Legal & Ethical Policies
                        </h1>

                        <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                            Welcome to PANSGPT. We are here to make your journey through Pharmacy school smoother, smarter, and more efficient.
                            Below are the rules of the road—written as simply as possible because we want you to understand them.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                            <Badge className="bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20">
                                <span className="mr-2">Last Updated:</span> December 14, 2025
                            </Badge>
                        </div>
                    </motion.div>
                </section>

                {/* Important Notice */}
                <section className="pb-12 px-6 sm:px-8 lg:px-12">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <Card className="bg-amber-500/10 border-amber-500/20">
                            <CardContent className="pt-6">
                                <div className="flex gap-4">
                                    <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-1" />
                                    <div>
                                        <h3 className="text-foreground mb-2">Important Notice</h3>
                                        <p className="text-muted-foreground">
                                            Please note that these documents constitute a legally binding contract between you and PANSGPT.
                                            By using our service, you agree to be bound by all of the terms, conditions, and notices contained herein.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </section>

                {/* Quick Navigation */}
                <section className="pb-12 px-6 sm:px-8 lg:px-12">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <Card className="bg-card border-border">
                            <CardContent className="pt-6">
                                <h3 className="text-foreground mb-4 flex items-center gap-2">
                                    <BookOpen className="w-5 h-5 text-primary" />
                                    Quick Navigation
                                </h3>
                                <div className="grid md:grid-cols-2 gap-3">
                                    {[
                                        { id: "terms-of-use", label: "1. Terms of Use", icon: FileText },
                                        { id: "privacy-policy", label: "2. Privacy Policy", icon: Lock },
                                        { id: "academic-integrity", label: "3. Academic Integrity Policy", icon: Scale },
                                        { id: "ai-limitations", label: "4. AI Limitations & Accuracy", icon: Brain }
                                    ].map((item, index) => (
                                        <motion.button
                                            key={index}
                                            onClick={() => scrollToSection(item.id)}
                                            className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-primary/10 transition-colors text-left border border-transparent hover:border-primary/20"
                                            whileHover={{ x: 5 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <item.icon className="w-4 h-4 text-primary flex-shrink-0" />
                                            <span className="text-muted-foreground text-sm">{item.label}</span>
                                        </motion.button>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </section>

                {/* Main Content */}
                <section className="pb-20 px-6 sm:px-8 lg:px-12 space-y-12">

                    {/* SECTION 1: TERMS OF USE */}
                    <motion.div
                        id="terms-of-use"
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                                <FileText className="w-6 h-6 text-primary" />
                            </div>
                            <h2 className="text-3xl text-foreground">1. Terms of Use (The Rulebook)</h2>
                        </div>

                        <Accordion type="single" collapsible className="space-y-4">
                            <AccordionItem value="what-is-pansgpt" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    1.1 What PANSGPT Is (And Isn't)
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground space-y-4 pt-4">
                                    <p className="text-sm">
                                        PANSGPT is an AI-powered study assistant designed for Pharmacy students across various institutions.
                                        We leverage localized course materials relevant to your specific school to provide context-aware academic support.
                                    </p>
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <Card className="bg-primary/5 border-primary/20">
                                            <CardContent className="pt-4">
                                                <div className="flex gap-3">
                                                    <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                                                    <div>
                                                        <p className="text-foreground text-sm font-medium mb-1">What we ARE:</p>
                                                        <p className="text-sm">A study aid, a revision tool, and a productivity booster designed to supplement your coursework.</p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                        <Card className="bg-red-500/5 border-red-500/20">
                                            <CardContent className="pt-4">
                                                <div className="flex gap-3">
                                                    <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                                    <div>
                                                        <p className="text-foreground text-sm font-medium mb-1">What we are NOT:</p>
                                                        <p className="text-sm">We are not a medical device, we are not your Lecturer, and we are certainly not a replacement for attending classes or your own independent study.</p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="who-can-use" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    1.2 Who Can Use This?
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground pt-4">
                                    <p className="text-sm">
                                        You must be at least 18 years of age (or have parental consent) and be a registered Pharmacy student
                                        or individual legally permitted to use academic tools in your jurisdiction. You are responsible for
                                        maintaining the confidentiality of your account credentials. We reserve the right to suspend or terminate
                                        accounts that violate these terms or compromise the security of the platform.
                                    </p>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="acceptable-use" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    1.3 Acceptable Use (The "Do's and Don'ts")
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground space-y-4 pt-4">
                                    <p className="text-sm">We built this for learning, not for cutting corners.</p>

                                    <Card className="bg-primary/5 border-primary/20">
                                        <CardContent className="pt-4">
                                            <div className="flex gap-3">
                                                <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-foreground text-sm font-medium mb-2">✅ DO use PANSGPT to:</p>
                                                    <ul className="space-y-1 text-sm list-disc list-inside">
                                                        <li>Summarize long lecture slides and texts.</li>
                                                        <li>Clarify complex mechanisms of action or pharmacognosy concepts.</li>
                                                        <li>Generate practice quizzes to test your knowledge before real exams.</li>
                                                    </ul>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card className="bg-red-500/10 border-red-500/20">
                                        <CardContent className="pt-4">
                                            <div className="flex gap-3">
                                                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-foreground text-sm font-medium mb-2">❌ DO NOT use PANSGPT to:</p>
                                                    <ul className="space-y-2 text-sm">
                                                        <li><span className="text-foreground font-medium">Cheat:</span> Do not use this tool during exams, tests, or for any form of academic malpractice.</li>
                                                        <li><span className="text-foreground font-medium">Plagiarize:</span> Do not submit AI-generated answers as your own original work for assignments or essays.</li>
                                                        <li><span className="text-foreground font-medium">Treat Patients:</span> STRICTLY PROHIBITED. PANSGPT is for academic theory only. Never use this tool to make real-life clinical, medical, or pharmaceutical decisions.</li>
                                                        <li><span className="text-foreground font-medium">Harm:</span> Do not use the platform for illegal activities or to harass others.</li>
                                                    </ul>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="subscriptions" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    1.4 Subscriptions & Billing
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground space-y-3 pt-4">
                                    <p className="text-sm">To sustain the service, specific premium features require a paid subscription.</p>
                                    <div className="space-y-2">
                                        <div className="pl-4 border-l-2 border-primary/20">
                                            <p className="text-foreground text-sm mb-1">Refunds</p>
                                            <p className="text-sm">All fees are non-refundable except as required by applicable law.</p>
                                        </div>
                                        <div className="pl-4 border-l-2 border-primary/20">
                                            <p className="text-foreground text-sm mb-1">Renewals</p>
                                            <p className="text-sm">You are responsible for managing your subscription. To avoid automatic charges, you must cancel before your renewal date.</p>
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="intellectual-property" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    1.5 Intellectual Property
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground pt-4">
                                    <p className="text-sm">
                                        PANSGPT, including its algorithms, interface, and branding, is the exclusive property of the PANSGPT team.
                                        You are granted a limited, non-exclusive license to use the service for your personal study. You may not copy,
                                        reverse-engineer, or resell any part of the service. Furthermore, by using the service, you grant PANSGPT a
                                        license to use your anonymized queries to further train and improve the AI model.
                                    </p>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="limitation-liability" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    1.6 Limitation of Liability & Disclaimer
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground space-y-3 pt-4">
                                    <Card className="bg-amber-500/10 border-amber-500/20">
                                        <CardContent className="pt-4">
                                            <p className="text-foreground text-sm font-medium">READ CAREFULLY: PANSGPT is provided "as is" and "as available" without warranties of any kind.</p>
                                        </CardContent>
                                    </Card>
                                    <ul className="space-y-2 text-sm list-disc list-inside">
                                        <li>We do not guarantee that the service will be uninterrupted, secure, or error-free, particularly in the event of local internet service disruptions or power outages.</li>
                                        <li>We are not liable for any direct, indirect, incidental, or consequential damages arising from your use of the service, including but not limited to academic failure, data loss, or reliance on incorrect information.</li>
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="indemnification" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    1.7 Indemnification (Your Responsibility)
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground pt-4">
                                    <p className="text-sm">
                                        You agree to indemnify and hold PANSGPT, its creators, and affiliates harmless from any claims, damages,
                                        or legal fees resulting from your violation of these terms or your misuse of the service (including, but
                                        not limited to, using the app for clinical practice or academic misconduct).
                                    </p>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="governing-law" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    1.8 Governing Law
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground pt-4">
                                    <p className="text-sm">
                                        These Terms are governed by the laws of the Federal Republic of Nigeria. We agree to first attempt to
                                        resolve any disputes amicably via email support. If this fails, the matter shall be subject to the
                                        exclusive jurisdiction of the courts located in Nigeria.
                                    </p>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="changes-terms" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    1.9 Changes to Terms
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground pt-4">
                                    <p className="text-sm">
                                        We may update these policies as we expand to new schools and features. Continued use of PANSGPT after
                                        updates constitutes acceptance of the new terms.
                                    </p>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </motion.div>

                    {/* SECTION 2: PRIVACY POLICY */}
                    <motion.div
                        id="privacy-policy"
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Lock className="w-6 h-6 text-primary" />
                            </div>
                            <h2 className="text-3xl text-foreground">2. Privacy Policy (NDPR & NDPA Compliant)</h2>
                        </div>

                        <Card className="bg-primary/5 border-primary/20 mb-6">
                            <CardContent className="pt-6">
                                <p className="text-muted-foreground text-sm">
                                    This Privacy Policy is crafted in accordance with the Nigeria Data Protection Act (NDPA) 2023
                                    and the Nigeria Data Protection Regulation (NDPR).
                                </p>
                            </CardContent>
                        </Card>

                        <Accordion type="single" collapsible className="space-y-4">
                            <AccordionItem value="data-collection" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    2.1 What We Collect
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground space-y-4 pt-4">
                                    <p className="text-sm">To provide a personalized experience, we collect:</p>
                                    <div className="grid gap-3">
                                        <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
                                            <UserCheck className="w-5 h-5 text-primary flex-shrink-0" />
                                            <div>
                                                <p className="text-foreground text-sm font-medium">Identity Data</p>
                                                <p className="text-sm">Email address, name, and your specific institution/school level.</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
                                            <Database className="w-5 h-5 text-primary flex-shrink-0" />
                                            <div>
                                                <p className="text-foreground text-sm font-medium">Usage Data</p>
                                                <p className="text-sm">Features used, time spent, IP address, device type, error logs, and session information collected via cookies.</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
                                            <FileText className="w-5 h-5 text-primary flex-shrink-0" />
                                            <div>
                                                <p className="text-foreground text-sm font-medium">Content Data</p>
                                                <p className="text-sm">The academic questions you ask and the feedback you provide.</p>
                                            </div>
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="legal-basis" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    2.2 Legal Basis & Usage of Data
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground space-y-3 pt-4">
                                    <p className="text-sm">Under the NDPA, we process your data based on the following legal grounds:</p>
                                    <div className="space-y-2">
                                        <div className="pl-4 border-l-2 border-primary/20">
                                            <p className="text-foreground text-sm mb-1">Performance of Contract</p>
                                            <p className="text-sm">To create your account, manage subscriptions, and deliver the study service.</p>
                                        </div>
                                        <div className="pl-4 border-l-2 border-primary/20">
                                            <p className="text-foreground text-sm mb-1">Legitimate Interest</p>
                                            <p className="text-sm">To train our AI (anonymized) and improve the accuracy of pharmacy materials.</p>
                                        </div>
                                        <div className="pl-4 border-l-2 border-primary/20">
                                            <p className="text-foreground text-sm mb-1">Consent</p>
                                            <p className="text-sm">For marketing communications (which you can opt out of at any time).</p>
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="data-retention" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    2.3 Data Retention
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground space-y-3 pt-4">
                                    <p className="text-sm">We retain your personal data only as long as necessary to fulfill the purposes for which it was collected, or as required by law.</p>
                                    <div className="space-y-2">
                                        <div className="pl-4 border-l-2 border-primary/20">
                                            <p className="text-foreground text-sm mb-1">Active Accounts</p>
                                            <p className="text-sm">Data is kept while your account is active.</p>
                                        </div>
                                        <div className="pl-4 border-l-2 border-primary/20">
                                            <p className="text-foreground text-sm mb-1">Inactive Accounts</p>
                                            <p className="text-sm">If you delete your account, your personal identifiers are removed immediately, though anonymized query data may be retained for AI training purposes.</p>
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="data-security" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    2.4 Data Security
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground pt-4">
                                    <p className="text-sm">
                                        We employ industry-standard security protocols (encryption and access controls) to protect your
                                        information against theft, unauthorized access, or loss.
                                    </p>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="third-parties" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    2.5 Third Parties
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground pt-4">
                                    <p className="text-sm">
                                        We utilize trusted third-party providers (e.g., cloud hosting, payment processors) to operate the service.
                                        These partners are compliant with relevant data protection laws and process data solely for PANSGPT functionality.
                                    </p>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="your-rights" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    2.6 Your Rights (NDPR)
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground space-y-4 pt-4">
                                    <p className="text-sm">As a user in Nigeria, you have specific rights:</p>
                                    <div className="grid gap-3">
                                        <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
                                            <Eye className="w-5 h-5 text-primary flex-shrink-0" />
                                            <div>
                                                <p className="text-foreground text-sm font-medium">Right to Access</p>
                                                <p className="text-sm">Ask for a copy of the data we hold about you.</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
                                            <FileText className="w-5 h-5 text-primary flex-shrink-0" />
                                            <div>
                                                <p className="text-foreground text-sm font-medium">Right to Rectification</p>
                                                <p className="text-sm">Correct any wrong details (like your school level).</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
                                            <XCircle className="w-5 h-5 text-primary flex-shrink-0" />
                                            <div>
                                                <p className="text-foreground text-sm font-medium">Right to Erasure</p>
                                                <p className="text-sm">Ask us to delete your data ("Right to be Forgotten").</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
                                            <Mail className="w-5 h-5 text-primary flex-shrink-0" />
                                            <div>
                                                <p className="text-foreground text-sm font-medium">Right to Withdraw Consent</p>
                                                <p className="text-sm">Stop us from sending marketing emails.</p>
                                            </div>
                                        </div>
                                    </div>
                                    <Card className="bg-primary/5 border-primary/20">
                                        <CardContent className="pt-4">
                                            <p className="text-sm">
                                                <span className="text-foreground font-medium">Contact for Privacy:</span> To exercise these rights,
                                                email us at <a href="mailto:support@pansgpt.site" className="text-primary hover:underline">support@pansgpt.site</a> (Subject: Privacy Request).
                                            </p>
                                        </CardContent>
                                    </Card>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </motion.div>

                    {/* SECTION 3: ACADEMIC INTEGRITY POLICY */}
                    <motion.div
                        id="academic-integrity"
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Scale className="w-6 h-6 text-primary" />
                            </div>
                            <h2 className="text-3xl text-foreground">3. Academic Integrity Policy (The Honor Code)</h2>
                        </div>

                        <Card className="bg-primary/5 border-primary/20 mb-6">
                            <CardContent className="pt-6">
                                <p className="text-muted-foreground text-sm">
                                    PANSGPT is built to support your intellect, not replace it. We expect all users to adhere to
                                    the academic regulations of their respective institutions.
                                </p>
                            </CardContent>
                        </Card>

                        <Accordion type="single" collapsible className="space-y-4">
                            <AccordionItem value="permitted-use" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    3.1 Permitted Use
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground pt-4">
                                    <p className="text-sm mb-3">Use PANSGPT to:</p>
                                    <ul className="space-y-2 text-sm">
                                        <li className="flex gap-2">
                                            <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                            <span>Deconstruct difficult topics.</span>
                                        </li>
                                        <li className="flex gap-2">
                                            <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                            <span>Create study guides and summaries.</span>
                                        </li>
                                        <li className="flex gap-2">
                                            <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                            <span>Self-test using generated questions.</span>
                                        </li>
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="prohibited-misconduct" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    3.2 Prohibited Misconduct
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground pt-4">
                                    <Card className="bg-red-500/10 border-red-500/20">
                                        <CardContent className="pt-4">
                                            <ul className="space-y-3 text-sm">
                                                <li className="flex gap-2">
                                                    <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                                    <span><span className="text-foreground font-medium">Submission of AI Text:</span> Submitting raw AI output as your own work is plagiarism.</span>
                                                </li>
                                                <li className="flex gap-2">
                                                    <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                                    <span><span className="text-foreground font-medium">Impersonation:</span> Using the service to generate work for others.</span>
                                                </li>
                                                <li className="flex gap-2">
                                                    <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                                    <span><span className="text-foreground font-medium">Uncited Use:</span> If your institution allows AI as a reference, you must cite PANSGPT appropriately.</span>
                                                </li>
                                            </ul>
                                        </CardContent>
                                    </Card>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="institutional-compliance" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    3.3 Institutional Compliance
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground pt-4">
                                    <Card className="bg-amber-500/10 border-amber-500/20">
                                        <CardContent className="pt-4">
                                            <p className="text-sm">
                                                You are solely responsible for knowing and following your specific school's policies regarding AI tools.
                                                If your institution bans AI for a specific assignment, using PANSGPT is a violation of your school's
                                                code of conduct, for which PANSGPT bears no liability.
                                            </p>
                                        </CardContent>
                                    </Card>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </motion.div>

                    {/* SECTION 4: AI LIMITATIONS & ACCURACY POLICY */}
                    <motion.div
                        id="ai-limitations"
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Brain className="w-6 h-6 text-primary" />
                            </div>
                            <h2 className="text-3xl text-foreground">4. AI Limitations & Accuracy Policy (Reality Check)</h2>
                        </div>

                        <Card className="bg-primary/5 border-primary/20 mb-6">
                            <CardContent className="pt-6">
                                <p className="text-muted-foreground text-sm">
                                    We pride ourselves on context-aware accuracy, but transparency is key to your success.
                                </p>
                            </CardContent>
                        </Card>

                        <Accordion type="single" collapsible className="space-y-4">
                            <AccordionItem value="source-answers" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    4.1 Source of Answers
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground pt-4">
                                    <p className="text-sm mb-3">Unlike generic AI, PANSGPT prioritizes:</p>
                                    <ol className="space-y-2 text-sm list-decimal list-inside">
                                        <li>Contextual alignment with official pharmacy curriculums.</li>
                                        <li>Verified academic texts and standard guidelines.</li>
                                    </ol>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="when-dont-know" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    4.2 When We Don't Know
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground pt-4">
                                    <p className="text-sm mb-3">If a query falls outside verified academic materials, PANSGPT is designed to alert you:</p>
                                    <Card className="bg-muted/50 border-border">
                                        <CardContent className="pt-4">
                                            <p className="text-sm italic text-foreground">
                                                "This specific topic isn't fully covered in the verified materials for your level/institution.
                                                Please confirm the official position with your Lecturer."
                                            </p>
                                        </CardContent>
                                    </Card>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="hallucinations" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    4.3 Hallucinations & Errors
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground space-y-3 pt-4">
                                    <p className="text-sm">Artificial Intelligence can occasionally generate incorrect or "hallucinated" information.</p>
                                    <div className="space-y-2">
                                        <div className="pl-4 border-l-2 border-amber-500/50">
                                            <p className="text-foreground text-sm mb-1">Verification is Mandatory</p>
                                            <p className="text-sm">You must cross-reference all PANSGPT outputs with your official lecture notes and recommended textbooks.</p>
                                        </div>
                                        <div className="pl-4 border-l-2 border-primary/50">
                                            <p className="text-foreground text-sm mb-1">Feedback</p>
                                            <p className="text-sm">Use the reporting tool to flag inaccuracies so we can correct them for the community.</p>
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="no-clinical-use" className="bg-card border border-border rounded-lg px-6">
                                <AccordionTrigger className="text-foreground hover:text-primary">
                                    4.4 NO Clinical Use (Medical Disclaimer)
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground pt-4">
                                    <Card className="bg-red-500/10 border-red-500/20">
                                        <CardContent className="pt-6">
                                            <div className="flex gap-4">
                                                <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-1" />
                                                <div className="space-y-3">
                                                    <p className="text-foreground font-bold text-lg">PANSGPT IS NOT A DIAGNOSTIC TOOL.</p>
                                                    <p className="text-sm">
                                                        It is strictly for educational purposes. Information provided by PANSGPT must NEVER be used for
                                                        patient management, prescribing, dosage calculation in a clinical setting, or medical advice.
                                                        Reliance on this tool for real-world medical decisions is a violation of our Terms of Use and
                                                        poses a severe risk to public safety.
                                                    </p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </motion.div>

                    {/* Final Notice */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <Card className="bg-primary/5 border-primary/20">
                            <CardContent className="pt-6">
                                <div className="flex gap-4">
                                    <CheckCircle className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
                                    <div>
                                        <h4 className="text-foreground mb-2">Thank You for Reading</h4>
                                        <p className="text-muted-foreground text-sm">
                                            By using PANSGPT, you acknowledge that you have read, understood, and agree to be bound by these
                                            Legal & Ethical Policies. We're committed to providing you with the best study experience while
                                            maintaining transparency, your privacy, and legal clarity.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </section>
            </div>

            {/* Scroll to Top Button */}
            {showScrollTop && (
                <motion.button
                    onClick={scrollToTop}
                    className="fixed bottom-8 right-8 w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors z-40"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                >
                    <ArrowUp className="w-5 h-5" />
                </motion.button>
            )}

            {/* Footer */}
            <Footer />
        </div>
    );
}
