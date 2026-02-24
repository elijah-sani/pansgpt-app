"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, BookOpen, Clock, Target, Users, Lightbulb, Shield } from "lucide-react";
import Navigation from "@/components/landing/Navigation";
import Footer from "@/components/landing/Footer";
import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background dark">
      {/* Navigation */}
      <Navigation />

      {/* Story Section */}
      <section className="pt-32 pb-16 px-6 sm:px-8 lg:px-12 bg-card/30">
        <div className="max-w-6xl mx-auto">
          <div className="space-y-8">
            <div className="text-center space-y-4">
              <h2 className="text-4xl text-foreground">
                Our Story: From <span className="text-primary">2 AM Cram Sessions</span> <br />
                to Real Understanding
              </h2>
            </div>

            <Card className="bg-card border-border">
              <CardContent className="p-8 lg:p-12 space-y-6">
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Does this sound familiar?
                </p>
                
                <p className="text-lg text-foreground leading-relaxed">
                  It's 2 AM. Your incourse exam is in 10 hours. You have 15 different lecture notes, 4 practical manuals, and 2 textbooks open on your phone. You <span className="text-primary">know</span> you read the answer... but you can't remember if it was in Dr. Audu's notes or Dr. Chime's slides.
                </p>

                <p className="text-lg text-foreground leading-relaxed">
                  You try <code className="px-2 py-1 bg-primary/10 text-primary rounded">Ctrl+F</code> (Find), but it's useless. You're drowning in a sea of PDFs, feeling stressed, overwhelmed, and just <span className="italic">wishing</span> you could just ask someone, "Hey, what's the simple explanation for the one-compartment model?"
                </p>

                <div className="pt-6 border-t border-border">
                  <p className="text-xl text-primary text-center">
                    We've all been there. Because we are PANSites, just like you.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* The Problem Section */}
      <section className="py-16 px-6 sm:px-8 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="space-y-8">
            <div className="text-center space-y-4">
              <h2 className="text-4xl text-foreground">
                The Problem <span className="text-primary">We All Face</span>
              </h2>
            </div>

            <div className="space-y-6">
              <p className="text-lg text-muted-foreground leading-relaxed text-center max-w-3xl mx-auto">
                Pharmacy school is tough. The sheer volume of material is staggering. We are given brilliant lecture notes from dedicated lecturers, but the challenge isn't just <span className="text-foreground italic">accessing</span> the information—it's <span className="text-foreground italic">synthesizing</span> it.
              </p>

              <div className="grid md:grid-cols-3 gap-6 pt-6">
                <Card className="bg-card border-border hover:border-primary/50 transition-colors">
                  <CardContent className="p-6 space-y-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <BookOpen className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-foreground">Information Overload</h3>
                    <p className="text-muted-foreground">
                      We had <span className="text-foreground italic">too much</span> information, making it impossible to find the <span className="text-foreground italic">right</span> information when we needed it most.
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-card border-border hover:border-primary/50 transition-colors">
                  <CardContent className="p-6 space-y-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Clock className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-foreground">Wasted Time</h3>
                    <p className="text-muted-foreground">
                      We spent more time <span className="text-foreground italic">searching</span> for answers than <span className="text-foreground italic">understanding</span> them.
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-card border-border hover:border-primary/50 transition-colors">
                  <CardContent className="p-6 space-y-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Lightbulb className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-foreground">Gaps in Understanding</h3>
                    <p className="text-muted-foreground">
                      It's easy to memorize a definition, but it's hard to <span className="text-foreground italic">truly</span> understand a complex mechanism. Generic tools like ChatGPT can't help—they haven't read our notes.
                    </p>
                  </CardContent>
                </Card>
              </div>

              <p className="text-xl text-foreground text-center pt-6">
                We knew there had to be a better way.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Our Solution Section */}
      <section className="py-16 px-6 sm:px-8 lg:px-12 bg-card/30">
        <div className="max-w-6xl mx-auto">
          <div className="space-y-8">
            <div className="text-center space-y-4">
              <h2 className="text-4xl text-foreground">
                Our Solution: The Tool <span className="text-primary">We Wished We Had</span>
              </h2>
            </div>

            <Card className="bg-card border-border">
              <CardContent className="p-8 lg:p-12 space-y-6">
                <p className="text-lg text-foreground leading-relaxed">
                  We aren't a big, faceless tech company. We are pharmacy students at the University of Jos.
                </p>

                <p className="text-lg text-foreground leading-relaxed">
                  We built PansGPT because it's the tool we desperately wished we had.
                </p>

                <div className="bg-primary/10 border-l-4 border-primary p-6 rounded-r-lg">
                  <p className="text-xl text-foreground leading-relaxed">
                    PansGPT is an AI study partner that we have <span className="text-primary italic">personally fed</span> our entire curriculum.
                  </p>
                </div>

                <p className="text-lg text-muted-foreground leading-relaxed">
                  We took those same 15 lecture notes, the practical manuals, and the textbooks, and we built an AI that <span className="text-foreground italic">understands</span> them. It's a "closed-loop" system, meaning it <span className="text-foreground">does not search the random internet.</span>
                </p>

                <p className="text-lg text-foreground leading-relaxed">
                  It searches <span className="text-primary italic">our</span> notes. Your notes.
                </p>

                <p className="text-lg text-muted-foreground leading-relaxed">
                  When you ask PansGPT a question, it finds the answer from your <span className="text-foreground italic">exact</span> course material and gives it to you in plain, simple English. It can summarize, explain, and even tell you which document the answer came from.
                </p>

                <div className="pt-6 border-t border-border space-y-2">
                  <p className="text-xl text-foreground">
                    It's not a cheat code.
                  </p>
                  <p className="text-2xl text-primary">
                    It's a 24/7 tutor that's already done all the reading.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Vision & Mission Section */}
      <section className="py-16 px-6 sm:px-8 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="space-y-8">
            <div className="text-center space-y-4">
              <h2 className="text-4xl text-foreground">
                Our Promise: <span className="text-primary">Our Vision & Mission</span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                This is more than just an app for us. It's our way of helping our community. We believe that no student should fail just because they were overwhelmed.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/30">
                <CardContent className="p-8 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                      <Target className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-2xl text-foreground">Our Vision</h3>
                  </div>
                  <blockquote className="text-lg text-foreground leading-relaxed italic border-l-4 border-primary pl-6">
                    To be the essential, trusted study partner for every pharmacy student across Nigeria, dramatically improving their understanding and academic success by providing the most context-relevant learning support available.
                  </blockquote>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/30">
                <CardContent className="p-8 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                      <Shield className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-2xl text-foreground">Our Mission</h3>
                  </div>
                  <blockquote className="text-lg text-foreground leading-relaxed italic border-l-4 border-primary pl-6">
                    To transform the challenge of pharmacy school by providing every student with a supportive, hyper-personalized AI tutor, ensuring they gain mastery and clarity over their local curriculum with confidence.
                  </blockquote>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 px-6 sm:px-8 lg:px-12 bg-card/30">
        <div className="max-w-6xl mx-auto">
          <Card className="border-2 border-primary/30 bg-gradient-to-br from-card via-card to-primary/5 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-primary/10 rounded-full blur-3xl" />
            
            <CardContent className="p-12 lg:p-16 text-center space-y-8 relative z-10">
              
              <div className="space-y-4">
                <h2 className="text-4xl text-foreground">
                  An Invitation to Our <span className="text-primary">Fellow PANSites</span>
                </h2>
                <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
                  PansGPT is a tool built <span className="text-foreground italic">by</span> PANSites, <span className="text-foreground italic">for</span> PANSites.
                </p>
              </div>

              <div className="space-y-4 max-w-2xl mx-auto">
                <p className="text-lg text-foreground leading-relaxed">
                  Right now, it's 100% free to use. We are building this for <span className="text-primary italic">us</span>, and we want your help to make it even better. Use it, test it, and tell us what you think. Let us know what features you need.
                </p>
                <p className="text-xl text-foreground leading-relaxed">
                  Let's stop drowning in notes and start understanding them. <span className="text-primary">Together.</span>
                </p>
              </div>

              <div className="pt-4">
                <Link href="/signup">
                  <Button 
                    size="lg" 
                    className="bg-primary hover:bg-primary/90 text-primary-foreground text-lg px-8 py-6 h-auto group transition-all"
                  >
                    Start Studying Smarter
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}

