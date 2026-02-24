"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { motion } from "framer-motion";
import {
  FileText,
  Scale,
  AlertTriangle,
  BookOpen,
  Lock,
  CheckCircle,
  ArrowUp,
  Brain
} from "lucide-react";
import { useState, useEffect } from "react";
import Navigation from "@/components/landing/Navigation";
import Footer from "@/components/landing/Footer";

export default function TermsPage() {
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
                <FileText className="w-10 h-10 text-primary" />
              </div>
            </motion.div>

            <h1 className="text-5xl lg:text-6xl text-foreground">
              Terms and Conditions of Service
            </h1>

            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Please read these terms carefully. By using PansGPT, you agree to be bound by these terms and conditions.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Badge className="bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20">
                <span className="mr-2">Effective Date:</span> [Date of Launch]
              </Badge>
              <Badge className="bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20">
                <span className="mr-2">Last Revised:</span> [Date]
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
                      PLEASE READ THESE TERMS AND CONDITIONS OF SERVICE CAREFULLY. BY ACCESSING, REGISTERING FOR, OR USING THE PANSGPT SERVICE,
                      YOU ARE CREATING A LEGALLY BINDING CONTRACT WITH THE PANSGPT TEAM AND AGREE TO BE BOUND BY ALL OF THE TERMS, CONDITIONS,
                      AND NOTICES CONTAINED OR REFERENCED HEREIN.
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
                    { id: "binding-agreement", label: "Part A: Binding Agreement", icon: FileText },
                    { id: "licenses", label: "Part B: Licenses & IP", icon: Lock },
                    { id: "disclaimers", label: "Part C: Disclaimers & Liability", icon: AlertTriangle },
                    { id: "general", label: "Part D: General Provisions", icon: Scale }
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

          {/* PART A: BINDING AGREEMENT */}
          <motion.div
            id="binding-agreement"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-3xl text-foreground">Part A: Binding Agreement</h2>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem value="definitions" className="bg-card border border-border rounded-lg px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  1. Definitions
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground space-y-4 pt-4">
                  <p>As used in this Agreement:</p>
                  <div className="space-y-3">
                    <div className="pl-4 border-l-2 border-primary/20">
                      <p className="text-foreground text-sm mb-1">"Agreement" or "Terms"</p>
                      <p className="text-sm">refers to these Terms and Conditions of Service, our Privacy Policy, and any other policies or notices posted on the Service, all of which are incorporated herein by reference.</p>
                    </div>
                    <div className="pl-4 border-l-2 border-primary/20">
                      <p className="text-foreground text-sm mb-1">"Service(s)"</p>
                      <p className="text-sm">refers to the PansGPT web application, its associated AI models, interfaces, content, functionalities, software, data, and any related services provided by us.</p>
                    </div>
                    <div className="pl-4 border-l-2 border-primary/20">
                      <p className="text-foreground text-sm mb-1">"User," "you," and "your"</p>
                      <p className="text-sm">refer to the individual person (student, staff, or otherwise) who creates an Account, accesses, or uses the Service.</p>
                    </div>
                    <div className="pl-4 border-l-2 border-primary/20">
                      <p className="text-foreground text-sm mb-1">"Account"</p>
                      <p className="text-sm">means the user-specific account you create to access and use the Service.</p>
                    </div>
                    <div className="pl-4 border-l-2 border-primary/20">
                      <p className="text-foreground text-sm mb-1">"Faculty Content"</p>
                      <p className="text-sm">refers to any and all pre-existing academic materials loaded into the Service's knowledge base by PansGPT, including but not limited to lecture notes, slides, practical manuals, textbooks, and other curriculum-related documents originating from the Faculty of Pharmaceutical Sciences, University of Jos.</p>
                    </div>
                    <div className="pl-4 border-l-2 border-primary/20">
                      <p className="text-foreground text-sm mb-1">"User Content"</p>
                      <p className="text-sm">refers to any content, data, or information that you upload, submit, post, or otherwise provide to the Service, including personal notes, queries, or documents.</p>
                    </div>
                    <div className="pl-4 border-l-2 border-primary/20">
                      <p className="text-foreground text-sm mb-1">"Output"</p>
                      <p className="text-sm">refers to any and all text, data, information, or other content generated, provided, or synthesized by the artificial intelligence models within the Service in response to your queries or use.</p>
                    </div>
                    <div className="pl-4 border-l-2 border-primary/20">
                      <p className="text-foreground text-sm mb-1">"AI Model"</p>
                      <p className="text-sm">refers to the underlying generative artificial intelligence algorithms and large language models (such as those from Google) that power the Service.</p>
                    </div>
                    <div className="pl-4 border-l-2 border-primary/20">
                      <p className="text-foreground text-sm mb-1">"Intellectual Property Rights"</p>
                      <p className="text-sm">means any and all registered and unregistered rights granted, applied for, or otherwise now or hereafter in existence under or related to any patent, copyright, trademark, trade secret, database protection, or other intellectual property rights laws, and all similar or equivalent rights or forms of protection, in any part of the world.</p>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="agreement" className="bg-card border border-border rounded-lg px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  2. Agreement and Eligibility
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground space-y-4 pt-4">
                  <div>
                    <p className="text-foreground mb-2">2.1. Binding Contract</p>
                    <p className="text-sm">This Agreement constitutes a legal, binding contract between you and PansGPT. Your access to and use of the Service is expressly conditioned on your assent to all terms of this Agreement. If you do not agree to these Terms, you have no right to access or use the Service.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">2.2. Eligibility</p>
                    <p className="text-sm">This Service is designed for and intended for use by current students, academic staff, and affiliates of the Faculty of Pharmaceutical Sciences, University of Jos ("PANS"). You represent and warrant that you meet this eligibility requirement.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">2.3. Age Requirement</p>
                    <p className="text-sm">You must be at least eighteen (18) years of age, or the age of legal majority in your jurisdiction, to create an Account and use the Service. If you are under the age of legal majority, you may only use the Service with the express consent and supervision of a parent or legal guardian who agrees to be bound by this Agreement.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">2.4. Amendments to Terms</p>
                    <p className="text-sm">We reserve the right, in our sole and absolute discretion, to modify, amend, or replace these Terms at any time. We will provide notice of material changes, such as by posting the updated Terms on the Service, sending an email to your registered address, or displaying a notice upon your next login. Your continued use of the Service after the effective date of any such changes constitutes your acceptance of the new Terms. It is your responsibility to review these Terms periodically.</p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="accounts" className="bg-card border border-border rounded-lg px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  3. User Accounts and Security
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground space-y-4 pt-4">
                  <div>
                    <p className="text-foreground mb-2">3.1. Account Creation</p>
                    <p className="text-sm">To access the full features of the Service, you must register for an Account. You agree to provide information that is true, accurate, current, and complete.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">3.2. Account Security</p>
                    <p className="text-sm">You are solely and fully responsible for maintaining the confidentiality and security of your Account credentials (including your username and password). You are also solely responsible for any and all activities that occur under your Account. You agree to notify PansGPT immediately of any suspected or actual unauthorized use of your Account or any other breach of security. PansGPT will not be liable for any loss, damage, or liability arising from your failure to comply with this section.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">3.3. Account Misuse</p>
                    <p className="text-sm">You may not use another person's Account at any time. You may not impersonate any person or entity or misrepresent your affiliation with any person or entity, including the university or its staff.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">3.4. Account Suspension and Termination</p>
                    <p className="text-sm">PansGPT reserves the right, in its sole discretion, to suspend, disable, or terminate your Account or your access to the Service, without prior notice or liability, for any reason, including but not limited to your breach of this Agreement (particularly the Acceptable Use Policy in Section 6).</p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </motion.div>

          {/* PART B: LICENSES AND INTELLECTUAL PROPERTY */}
          <motion.div
            id="licenses"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-3xl text-foreground">Part B: Licenses and Intellectual Property</h2>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem value="license-grants" className="bg-card border border-border rounded-lg px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  4. License Grants
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground space-y-4 pt-4">
                  <div>
                    <p className="text-foreground mb-2">4.1. License to You</p>
                    <p className="text-sm">Subject to your strict and ongoing compliance with this Agreement, PansGPT grants you a limited, non-exclusive, non-transferable, non-sublicensable, revocable license to access and use the Service for your personal, non-commercial, academic study purposes only.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">4.2. License from You (User Content)</p>
                    <p className="text-sm">By uploading, submitting, or posting User Content to the Service, you retain any and all ownership rights you have in that content. However, you grant PansGPT a limited, non-exclusive, worldwide, royalty-free, sublicensable, and transferable license to use, host, store, reproduce, analyze, process, modify, adapt, and display your User Content solely for the purpose of operating, providing, securing, and improving the Service to you. This license terminates when you delete your User Content or your Account, subject to system back-ups.</p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="feedback" className="bg-card border border-border rounded-lg px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  5. Feedback
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pt-4">
                  <p className="text-sm">If you provide PansGPT with any ideas, suggestions, bug reports, or other feedback regarding the Service ("Feedback"), you hereby grant PansGPT an unlimited, worldwide, perpetual, irrevocable, royalty-free, fully-paid, sublicensable license to use, exploit, incorporate, and commercialize such Feedback for any purpose, without any obligation or compensation to you.</p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="acceptable-use" className="bg-card border border-border rounded-lg px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  6. Acceptable Use Policy
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground space-y-4 pt-4">
                  <p className="text-sm">Your use of the Service is strictly contingent upon your adherence to the following rules. You shall not (and shall not permit or assist any third party to):</p>

                  <Card className="bg-red-500/10 border-red-500/20">
                    <CardContent className="pt-4">
                      <div className="flex gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <div className="space-y-2">
                          <p className="text-foreground text-sm">6.1. Academic Dishonesty</p>
                          <p className="text-sm">Use the Service for any form of academic misconduct, cheating, or dishonesty. This includes, but is not limited to:</p>
                          <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                            <li>(a) Accessing or using the Service during any proctored, unproctored, timed, or untimed examination, test, or in-course assessment.</li>
                            <li>(b) Copying, pasting, or submitting any Output as your own original work in any assignment, paper, project, or exam without proper attribution (where permitted) or in violation of academic policy.</li>
                            <li>(c) Any use that violates the University of Jos's Code of Conduct, Faculty regulations, or any policy on academic integrity.</li>
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div>
                    <p className="text-foreground mb-2">6.2. Illegal or Harmful Conduct</p>
                    <p className="text-sm">Use the Service to generate, upload, or transmit any content or engage in any activity that is illegal, fraudulent, harassing, defamatory, hateful, discriminatory, obscene, or threatening.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">6.3. Service Disruption</p>
                    <p className="text-sm">Use any automated or manual means to (a) reverse-engineer, decompile, disassemble, or attempt to discover the source code of the Service or its underlying AI Models; (b) interfere with, disrupt, or place an unreasonable load on the Service or its servers; (c) bypass any security measures or access controls; (d) "scrape," "crawl," or "spider" any part of the Service or its content; or (e) introduce any viruses, malware, or other malicious code.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">6.4. Intellectual Property Infringement</p>
                    <p className="text-sm">Use the Service to infringe upon the Intellectual Property Rights of any third party or PansGPT. You shall not copy, distribute, sell, lease, sublicense, or republish any Faculty Content or Output, except as expressly permitted for your personal study under this Agreement.</p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="ip-ownership" className="bg-card border border-border rounded-lg px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  7. Intellectual Property Ownership
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground space-y-4 pt-4">
                  <div>
                    <p className="text-foreground mb-2">7.1. PansGPT Ownership</p>
                    <p className="text-sm">As between you and PansGPT, we (and our licensors) own all right, title, and interest in and to the Service, including its "look and feel," software, code, branding, logos, and all components other than Faculty Content and your User Content.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">7.2. Faculty Content</p>
                    <p className="text-sm">You acknowledge and agree that all Faculty Content is the exclusive intellectual property of its respective owners (e.g., individual lecturers, the University of Jos, or third-party publishers) and is protected by copyright law. Your use of Faculty Content is strictly limited by the license granted in Section 4.1.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">7.3. Ownership of Output</p>
                    <p className="text-sm">The legal status of AI-generated content is complex and evolving. PansGPT does not claim ownership over the unique Output generated for you as a creative work. However, you acknowledge that other users may receive identical or similar Output in response to similar queries. Your right to use the Output is subject to the licenses and restrictions in this Agreement, including the Acceptable Use Policy (Section 6) and the critical Disclaimers (Section 10).</p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="third-party" className="bg-card border border-border rounded-lg px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  8. Third-Party Services and Links
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pt-4">
                  <p className="text-sm">The Service may rely on or integrate with third-party services, such as cloud hosting providers (e.g., DataStax) and AI Model providers (e.g., Google). Your use of these third-party services may be subject to their own terms and conditions. PansGPT is not responsible or liable for the performance, availability, or security of any third-party service, nor for any content or practices of such third parties.</p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="privacy" className="bg-card border border-border rounded-lg px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  9. Data Privacy
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pt-4">
                  <p className="text-sm">Your privacy is important to us. Our collection, use, and protection of your personal information are governed by our Privacy Policy. By agreeing to these Terms, you also agree to the terms of our Privacy Policy.</p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </motion.div>

          {/* PART C: CRITICAL DISCLAIMERS, LIABILITY, AND DISPUTES */}
          <motion.div
            id="disclaimers"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-3xl text-foreground">Part C: Critical Disclaimers, Liability, and Disputes</h2>
            </div>

            <Card className="bg-amber-500/10 border-amber-500/20 mb-6">
              <CardContent className="pt-6">
                <div className="flex gap-4">
                  <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-1" />
                  <div>
                    <h4 className="text-foreground mb-2">Important Section</h4>
                    <p className="text-muted-foreground text-sm">
                      THIS SECTION CONTAINS IMPORTANT LIMITATIONS ON OUR LIABILITY AND YOUR REMEDIES. PLEASE READ IT CAREFULLY AND IN ITS ENTIRETY.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem value="warranties" className="bg-card border border-border rounded-lg px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  10. Warranties, Disclaimers, and Acknowledgements of Risk
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground space-y-4 pt-4">
                  <Card className="bg-red-500/10 border-red-500/20">
                    <CardContent className="pt-4">
                      <p className="text-foreground text-sm mb-2">YOU EXPRESSLY UNDERSTAND AND AGREE THAT YOUR USE OF THE SERVICE IS AT YOUR SOLE RISK.</p>
                    </CardContent>
                  </Card>

                  <div>
                    <p className="text-foreground mb-2">10.1. DISCLAIMER OF ALL WARRANTIES</p>
                    <p className="text-sm">TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT ANY WARRANTIES OF ANY KIND, EITHER EXPRESS, IMPLIED, OR STATUTORY. PANSGPT AND ITS CREATORS, FOUNDERS, AND AFFILIATES (COLLECTIVELY, "THE PANSGPT PARTIES") EXPRESSLY DISCLAIM ALL WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.</p>
                  </div>

                  <div>
                    <p className="text-foreground mb-2">10.2. NO WARRANTY OF SERVICE</p>
                    <p className="text-sm">THE PANSGPT PARTIES DO NOT WARRANT THAT: (A) THE SERVICE WILL BE UNINTERRUPTED, SECURE, ERROR-FREE, OR AVAILABLE AT ANY PARTICULAR TIME OR LOCATION (ESPECIALLY DURING PEAK EXAM PERIODS); (B) ANY DEFECTS OR ERRORS WILL BE CORRECTED; (C) THE SERVICE IS FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS; OR (D) THE RESULTS OF USING THE SERVICE WILL MEET YOUR REQUIREMENTS OR EXPECTATIONS.</p>
                  </div>

                  <Card className="bg-red-500/10 border-red-500/20">
                    <CardContent className="pt-4 space-y-3">
                      <p className="text-foreground text-sm">10.3. CRITICAL ACKNOWLEDGEMENT: AI-GENERATED CONTENT (OUTPUT)</p>
                      <ul className="space-y-2 text-sm">
                        <li>(A) YOU ACKNOWLEDGE THAT THE SERVICE USES EXPERIMENTAL GENERATIVE ARTIFICIAL INTELLIGENCE. YOU AGREE AND UNDERSTAND THAT AI MODELS ARE PRONE TO "HALLUCINATIONS." THIS MEANS THE AI CAN (AND WILL) PRODUCE OUTPUT THAT IS INACCURATE, INCORRECT, MISLEADING, BIASED, NONSENSICAL, OR COMPLETELY FABRICATED, EVEN IF IT APPEARS CONFIDENT AND FACTUAL.</li>
                        <li>(B) THE PANSGPT PARTIES MAKE NO WARRANTY, GUARANTEE, OR REPRESENTATION OF ANY KIND AS TO THE ACCURACY, COMPLETENESS, RELIABILITY, TIMELINESS, OR VALIDITY OF ANY OUTPUT.</li>
                        <li>(C) YOUR RESPONSIBILITY TO VERIFY: YOU ARE SOLELY AND ENTIRELY RESPONSIBLE FOR EVALUATING ALL OUTPUT. YOU MUST INDEPENDENTLY VERIFY AND CROSS-REFERENCE ALL INFORMATION (ESPECIALLY FACTS, FIGURES, FORMULAS, DOSAGES, MECHANISMS OF ACTION, AND ALL OTHER ACADEMIC CONTENT) AGAINST YOUR PRIMARY, OFFICIAL COURSE MATERIALS (THE FACULTY CONTENT) AND SEEK CLARIFICATION FROM QUALIFIED ACADEMIC STAFF (YOUR LECTURERS AND TUTORS).</li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-red-500/10 border-red-500/20">
                    <CardContent className="pt-4 space-y-3">
                      <p className="text-foreground text-sm">10.4. CRITICAL ACKNOWLEDGEMENT: NO MEDICAL OR PHARMACOLOGICAL ADVICE</p>
                      <ul className="space-y-2 text-sm">
                        <li>(A) THE SERVICE IS AN INFORMATIONAL AND EDUCATIONAL STUDY AID ONLY.</li>
                        <li>(B) THE OUTPUT PROVIDED BY THE SERVICE IS NOT MEDICAL ADVICE, PHARMACOLOGICAL ADVICE, DIAGNOSTIC ADVICE, OR A SUBSTITUTE FOR PROFESSIONAL MEDICAL JUDGMENT, DIAGNOSIS, OR TREATMENT.</li>
                        <li>(C) DO NOT RELY ON THE OUTPUT. YOU MUST NEVER USE INFORMATION FROM THE SERVICE TO MAKE ANY DECISION REGARDING PATIENT CARE, DIAGNOSIS, TREATMENT, OR ANY OTHER PROFESSIONAL MEDICAL OR PHARMACEUTICAL ACTIVITY, EITHER IN YOUR STUDIES, EXAMS (E.G., OSCEs), OR IN ANY FUTURE PROFESSIONAL CAPACITY. RELIANCE ON ANY OUTPUT IS SOLELY AT YOUR OWN RISK.</li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-amber-500/10 border-amber-500/20">
                    <CardContent className="pt-4 space-y-3">
                      <p className="text-foreground text-sm">10.5. CRITICAL ACKNOWLEDGEMENT: NO ACADEMIC GUARANTEE</p>
                      <ul className="space-y-2 text-sm">
                        <li>(A) THE SERVICE IS A SUPPLEMENTAL STUDY TOOL ONLY. IT IS NOT INTENDED TO REPLACE, AND DOES NOT REPLACE, YOUR OWN DILIGENT STUDY, ATTENDANCE AT LECTURES, COMPLETION OF ASSIGNMENTS, AND CRITICAL THINKING.</li>
                        <li>(B) PANSGPT MAKES NO GUARANTEE OR WARRANTY THAT YOUR USE OF THE SERVICE WILL RESULT IN IMPROVED GRADES, ACADEMIC SUCCESS, OR THE PASSING OF ANY EXAM OR COURSE. YOUR ACADEMIC PERFORMANCE REMAINS YOUR SOLE RESPONSIBILITY.</li>
                      </ul>
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="liability" className="bg-card border border-border rounded-lg px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  11. Limitation of Liability
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground space-y-4 pt-4">
                  <div>
                    <p className="text-foreground mb-2">11.1. EXCLUSION OF DAMAGES</p>
                    <p className="text-sm mb-3">TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE PANSGPT PARTIES BE LIABLE TO YOU OR ANY THIRD PARTY FOR ANY INDIRECT, INCIDENTAL, SPECIAL, PUNITIVE, CONSEQUENTIAL, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO:</p>
                    <ul className="space-y-2 text-sm ml-4">
                      <li>(A) DAMAGES FOR LOSS OF PROFITS, GOODWILL, USE, OR DATA;</li>
                      <li>(B) DAMAGES ARISING FROM YOUR RELIANCE ON ANY OUTPUT, WHETHER ACCURATE OR INACCURATE;</li>
                      <li>(C) DAMAGES RELATED TO ANY ACADEMIC PENALTY, FAILED EXAM, LOSS OF GRADES, OR EXPULSION, WHETHER OR NOT RELATED TO AN ALLEGED VIOLATION OF ACADEMIC INTEGRITY;</li>
                      <li>(D) DAMAGES ARISING FROM YOUR INABILITY TO USE THE SERVICE OR ANY SERVICE DOWNTIME; OR</li>
                      <li>(E) DAMAGES ARISING FROM ANY UNAUTHORIZED ACCESS TO OR USE OF YOUR ACCOUNT.</li>
                    </ul>
                  </div>

                  <div>
                    <p className="text-foreground mb-2">11.2. APPLICABILITY</p>
                    <p className="text-sm">THIS LIMITATION OF LIABILITY APPLIES REGARDLESS OF THE LEGAL THEORY (WHETHER WARRANTY, CONTRACT, TORT (INCLUDING NEGLIGENCE), STATUTE, OR OTHERWISE) AND EVEN IF THE PANSGPT PARTIES HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
                  </div>

                  <div>
                    <p className="text-foreground mb-2">11.3. CAP ON LIABILITY</p>
                    <p className="text-sm mb-3">TO THE FULLEST EXTENT PERMITTED BY LAW, THE TOTAL AGGREGATE LIABILITY OF THE PANSGPT PARTIES TO YOU FOR ALL CLAIMS, DAMAGES, AND CAUSES OF ACTION ARISING FROM OR RELATED TO THIS AGREEMENT OR THE SERVICE SHALL NOT EXCEED THE GREATER OF:</p>
                    <ul className="space-y-2 text-sm ml-4">
                      <li>(A) THE TOTAL AMOUNT, IF ANY, YOU HAVE PAID TO PANSGPT TO USE THE SERVICE IN THE SIX (6) MONTHS PRECEDING THE CLAIM; OR</li>
                      <li>(B) ONE HUNDRED UNITED STATES DOLLARS ($100.00 USD) OR ITS EQUIVALENT IN NIGERIAN NAIRA.</li>
                      <li className="text-muted-foreground italic">(As the service is currently free, your liability cap is effectively (B).)</li>
                    </ul>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="indemnification" className="bg-card border border-border rounded-lg px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  12. Indemnification
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pt-4">
                  <p className="text-sm">You agree to defend, indemnify, and hold harmless the PansGPT Parties (its creators, founders, affiliates, and agents) from and against any and all claims, demands, suits, actions, damages, liabilities, losses, costs, and expenses (including, without limitation, reasonable attorneys' fees) arising out of or in any way connected with: (a) your breach of this Agreement (including, but not limited to, a violation of the Acceptable Use Policy); (b) your User Content; (c) your violation of any law or the rights of any third party (including academic integrity policies or intellectual property rights); and (d) your use or misuse of the Service, including your reliance on any Output.</p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="disputes" className="bg-card border border-border rounded-lg px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  13. Governing Law and Dispute Resolution
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground space-y-4 pt-4">
                  <div>
                    <p className="text-foreground mb-2">13.1. Governing Law</p>
                    <p className="text-sm">This Agreement shall be governed by and construed in accordance with the laws of the Federal Republic of Nigeria, without regard to its conflict of law principles.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">13.2. Amicable Negotiation</p>
                    <p className="text-sm">The parties agree to first attempt to resolve any dispute, claim, or controversy arising out of this Agreement through good-faith amicable negotiation for a period of at least thirty (30) days.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">13.3. Binding Arbitration</p>
                    <p className="text-sm">If the dispute is not resolved through negotiation, you agree that such dispute shall be referred to and finally resolved by a single arbitrator in binding arbitration, conducted in English in Jos, Plateau State, in accordance with the Arbitration and Conciliation Act (Cap A18, Laws of the Federation of Nigeria 2004).</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">13.4. No Class Actions</p>
                    <p className="text-sm">YOU AGREE THAT YOU MAY ONLY BRING CLAIMS AGAINST PANSGPT IN YOUR INDIVIDUAL CAPACITY, AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS OR REPRESENTATIVE PROCEEDING.</p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </motion.div>

          {/* PART D: GENERAL PROVISIONS */}
          <motion.div
            id="general"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Scale className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-3xl text-foreground">Part D: General Provisions</h2>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem value="termination" className="bg-card border border-border rounded-lg px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  14. Term and Termination
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground space-y-4 pt-4">
                  <div>
                    <p className="text-foreground mb-2">14.1. Term</p>
                    <p className="text-sm">This Agreement shall commence upon your first access or use of the Service and shall continue in full force and effect until terminated.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">14.2. Termination by You</p>
                    <p className="text-sm">You may terminate this Agreement at any time by ceasing all use of the Service and deleting your Account.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">14.3. Termination by Us</p>
                    <p className="text-sm">We may, in our sole discretion, suspend, disable, or terminate your Account and this Agreement, without notice, for any reason or no reason, including for any breach of these Terms.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">14.4. Survival</p>
                    <p className="text-sm">All provisions of this Agreement which by their nature should survive termination shall survive, including, without limitation, ownership provisions, Feedback (Section 5), Intellectual Property (Section 7), all Disclaimers and Acknowledgements (Section 10), Limitation of Liability (Section 11), Indemnification (Section 12), Dispute Resolution (Section 13), and General Provisions (Section 15).</p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="general-legal" className="bg-card border border-border rounded-lg px-6">
                <AccordionTrigger className="text-foreground hover:text-primary">
                  15. General Legal Provisions
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground space-y-4 pt-4">
                  <div>
                    <p className="text-foreground mb-2">15.1. Entire Agreement</p>
                    <p className="text-sm">This Agreement (including the Privacy Policy) constitutes the entire agreement between you and PansGPT concerning the Service and supersedes all prior or contemporaneous communications, whether oral or written.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">15.2. Severability</p>
                    <p className="text-sm">If any provision of this Agreement is found by a court of competent jurisdiction to be invalid, illegal, or unenforceable, that provision shall be limited or eliminated to the minimum extent necessary so that this Agreement shall otherwise remain in full force and effect.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">15.3. No Waiver</p>
                    <p className="text-sm">The failure of PansGPT to exercise or enforce any right or provision of this Agreement shall not constitute a waiver of such right or provision.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">15.4. Force Majeure</p>
                    <p className="text-sm">PansGPT shall not be liable for any failure to perform its obligations hereunder where such failure results from any cause beyond our reasonable control, including, without limitation, mechanical, electronic, or communications failure or degradation (including "line-noise" interference), acts of God, war, or governmental action.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">15.5. Assignment</p>
                    <p className="text-sm">You may not assign or transfer this Agreement or any of your rights or obligations hereunder, by operation of law or otherwise, without our prior written consent. We may assign this Agreement in its entirety, without your consent, in connection with a merger, acquisition, corporate reorganization, or sale of all or substantially all of our assets.</p>
                  </div>
                  <div>
                    <p className="text-foreground mb-2">15.6. Contact Information</p>
                    <p className="text-sm">If you have any questions about these Terms, please contact us at: <a href="mailto:legal@pansgpt.com" className="text-primary hover:underline">legal@pansgpt.com</a> or <a href="mailto:team@pansgpt.com" className="text-primary hover:underline">team@pansgpt.com</a></p>
                  </div>
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
                      By using PansGPT, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions.
                      We're committed to providing you with the best study experience while maintaining transparency and legal clarity.
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


