import { BookOpen, Shield, Sparkles, Clock } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";

export function WhatIsPansGPT() {
  return (
    <section className="py-24 px-6 sm:px-8 lg:px-12 bg-gradient-to-b from-card/30 to-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(34,197,94,0.05),transparent_50%)]" />
      
      <div className="container mx-auto max-w-6xl relative z-10">
        {/* Main Content */}
        <div className="text-center space-y-6 mb-16">
          <Badge variant="secondary" className="mx-auto w-fit">
            <Sparkles className="w-3 h-3 mr-1" />
            Built Specifically for PANSites
          </Badge>
          
          <h2 className="text-4xl lg:text-5xl text-foreground max-w-3xl mx-auto">
            Your Personal Study Helper... <br />
            <span className="text-primary">That's Already Done the Reading.</span>
          </h2>
          
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            PansGPT is not another ChatGPT. It doesn't search the random, confusing internet. Instead, it's a special tool that only reads the{" "}
            <span className="text-foreground font-medium">
              official University of Jos Faculty of Pharmaceutical Sciences notes, practicals, and textbooks
            </span>
            .
          </p>
        </div>

        {/* Info Cards Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
          <Card className="bg-card/50 border-border hover:border-primary/30 transition-all duration-300 group">
            <CardContent className="p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto group-hover:bg-primary/20 transition-colors">
                <BookOpen className="w-6 h-6 text-primary" />
              </div>
              <div className="space-y-1">
                <h4 className="text-foreground">Course-Specific</h4>
                <p className="text-sm text-muted-foreground">
                  Only reads UJ Pharmacy materials
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border hover:border-primary/30 transition-all duration-300 group">
            <CardContent className="p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto group-hover:bg-primary/20 transition-colors">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <div className="space-y-1">
                <h4 className="text-foreground">100% Accurate</h4>
                <p className="text-sm text-muted-foreground">
                  Based on your lecture notes
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border hover:border-primary/30 transition-all duration-300 group">
            <CardContent className="p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto group-hover:bg-primary/20 transition-colors">
                <Clock className="w-6 h-6 text-primary" />
              </div>
              <div className="space-y-1">
                <h4 className="text-foreground">24/7 Available</h4>
                <p className="text-sm text-muted-foreground">
                  Study at 2 AM? No problem
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border hover:border-primary/30 transition-all duration-300 group">
            <CardContent className="p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto group-hover:bg-primary/20 transition-colors">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div className="space-y-1">
                <h4 className="text-foreground">Simple Answers</h4>
                <p className="text-sm text-muted-foreground">
                  Clear explanations, no jargon
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom Description */}
        <div className="mt-12 max-w-3xl mx-auto">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-8 text-center">
              <p className="text-lg text-foreground leading-relaxed">
                It's like having a <span className="text-primary font-medium">helpful classmate</span> who has already read and understood everything, ready to explain it to you at 2 AM.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
