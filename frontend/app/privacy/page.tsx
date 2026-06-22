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
                        PANSGPT Privacy Policy
                    </h1>

                    <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                        We take your privacy and data security seriously. Below is our detailed Privacy Policy, outlining what data we collect, how it is used, and how we protect it in compliance with the Nigeria Data Protection Act (NDPA) and the Nigeria Data Protection Regulation (NDPR).
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                        <Badge className="bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20">
                            <span className="mr-2">Last Updated:</span> June 22, 2026
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
                                        Please note that this document outlines how your data is collected and processed when using PANSGPT. By using our service, you agree to the collection and use of information in accordance with this Privacy Policy.
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
                                    { id: "data-collection", label: "1. What We Collect", icon: Database },
                                    { id: "legal-basis", label: "2. Legal Basis & Usage", icon: UserCheck },
                                    { id: "data-retention", label: "3. Data Retention", icon: FileText },
                                    { id: "data-security", label: "4. Data Security", icon: Shield },
                                    { id: "third-parties", label: "5. Third Parties", icon: Scale },
                                    { id: "your-rights", label: "6. Your Rights (NDPA & NDPR)", icon: Eye },
                                    { id: "cookie-policy", label: "7. Cookie Policy", icon: Lock }
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

                <motion.div
                    id="privacy-policy-details"
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                >
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Lock className="w-6 h-6 text-primary" />
                        </div>
                        <h2 className="text-3xl text-foreground">Privacy Policy Details</h2>
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
                        <AccordionItem id="data-collection" value="data-collection" className="bg-card border border-border rounded-lg px-6">
                            <AccordionTrigger className="text-foreground hover:text-primary">
                                1. What We Collect
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

                        <AccordionItem id="legal-basis" value="legal-basis" className="bg-card border border-border rounded-lg px-6">
                            <AccordionTrigger className="text-foreground hover:text-primary">
                                2. Legal Basis & Usage of Data
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground space-y-3 pt-4">
                                <p className="text-sm">Under the NDPA, we process your data based on the following legal grounds:</p>
                                <div className="space-y-2">
                                    <div className="pl-4 border-l-2 border-primary/20">
                                        <p className="text-foreground text-sm mb-1">Performance of Contract</p>
                                        <p className="text-sm">To create your account, manage your study sessions, and deliver the study service.</p>
                                    </div>
                                    <div className="pl-4 border-l-2 border-primary/20">
                                        <p className="text-foreground text-sm mb-1">Legitimate Interest</p>
                                        <p className="text-sm">To train our AI (anonymized) and improve the accuracy of pharmacy materials.</p>
                                    </div>
                                    <div className="pl-4 border-l-2 border-primary/20">
                                        <p className="text-foreground text-sm mb-1">Consent</p>
                                        <p className="text-sm">For marketing or service updates (which you can opt out of at any time).</p>
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem id="data-retention" value="data-retention" className="bg-card border border-border rounded-lg px-6">
                            <AccordionTrigger className="text-foreground hover:text-primary">
                                3. Data Retention
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

                        <AccordionItem id="data-security" value="data-security" className="bg-card border border-border rounded-lg px-6">
                            <AccordionTrigger className="text-foreground hover:text-primary">
                                4. Data Security
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground pt-4">
                                <p className="text-sm">
                                    We employ industry-standard security protocols (encryption and access controls) to protect your
                                    information against theft, unauthorized access, or loss.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem id="third-parties" value="third-parties" className="bg-card border border-border rounded-lg px-6">
                            <AccordionTrigger className="text-foreground hover:text-primary">
                                5. Third Parties
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground pt-4">
                                <p className="text-sm">
                                    We utilize trusted third-party providers (e.g., database and cloud hosting providers) to operate the service.
                                    These partners are compliant with relevant data protection laws and process data solely for PANSGPT functionality.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem id="your-rights" value="your-rights" className="bg-card border border-border rounded-lg px-6">
                            <AccordionTrigger className="text-foreground hover:text-primary">
                                6. Your Rights (NDPR & NDPA)
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground space-y-4 pt-4">
                                <p className="text-sm">As a user in Nigeria, you have specific rights under data protection laws:</p>
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

                        <AccordionItem id="cookie-policy" value="cookie-policy" className="bg-card border border-border rounded-lg px-6">
                            <AccordionTrigger className="text-foreground hover:text-primary">
                                7. Cookie Policy
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground pt-4">
                                <p className="text-sm">
                                    PANSGPT uses essential cookies and similar local storage technologies strictly for session management, user authentication, and maintaining your settings (such as dark mode preferences). We do not use advertising or tracking cookies. By using our Service, you consent to the placement of these necessary cookies on your device.
                                </p>
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
                                        By using PANSGPT, you acknowledge that you have read, understood, and agree to be bound by this
                                        Privacy Policy. We're committed to providing you with the best study experience while
                                        maintaining transparency, your privacy, and data security.
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
