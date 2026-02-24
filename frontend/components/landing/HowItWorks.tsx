import { MessageSquare, Lightbulb, CheckCircle, ArrowRight } from "lucide-react";
import { Card, CardContent } from "../ui/card";

const steps = [
  {
    number: "1",
    icon: MessageSquare,
    title: "Ask a Question",
    description: "Type or speak any question. (Example: \"Summarize Dr. Chime's notes on drug metabolism\" or \"What is a half-life?\")",
  },
  {
    number: "2",
    icon: Lightbulb,
    title: "Get a Simple Answer",
    description: "PansGPT finds the exact info from your notes and gives you a clear answer. It even tells you which lecture note it came from so you can check.",
  },
  {
    number: "3",
    icon: CheckCircle,
    title: "Take a Quick Quiz",
    description: "Click one button to create a quiz on that topic. This is the best way to make sure you'll remember it for the exam.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 px-6 sm:px-8 lg:px-12 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(34,197,94,0.05),transparent_50%)]" />
      
      <div className="container mx-auto max-w-6xl relative z-10">
        <div className="text-center space-y-4 mb-20">
          <h2 className="text-4xl lg:text-5xl text-foreground">
            Get from <span className="text-primary">"Confused"</span> to <span className="text-primary">"Confident"</span>
          </h2>
          <p className="text-xl text-muted-foreground">in 3 Simple Steps</p>
        </div>

        {/* Steps Container */}
        <div className="relative">
          {/* Connection Line - Desktop */}
          <div className="hidden lg:block absolute top-16 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/50 to-transparent blur-sm"></div>
          </div>

          {/* Steps Grid */}
          <div className="grid md:grid-cols-3 gap-8 lg:gap-6 relative">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={index} className="relative">
                  {/* Step Card */}
                  <Card className="bg-card border-border hover:border-primary/50 transition-all duration-300 h-full group">
                    <CardContent className="p-8 space-y-6">
                      {/* Number Circle */}
                      <div className="flex items-center justify-center">
                        <div className="relative">
                          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-primary flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                            <span className="text-primary text-3xl font-semibold">{step.number}</span>
                          </div>
                          {/* Pulse effect */}
                          <div className="absolute inset-0 rounded-full bg-primary/20 animate-pulse opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </div>
                      </div>

                      {/* Icon */}
                      <div className="flex justify-center">
                        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                          <Icon className="w-7 h-7 text-primary" />
                        </div>
                      </div>

                      {/* Content */}
                      <div className="text-center space-y-3">
                        <h3 className="text-xl text-foreground">{step.title}</h3>
                        <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Arrow connector - Desktop only */}
                  {index < steps.length - 1 && (
                    <div className="hidden lg:flex absolute top-16 -right-4 items-center justify-center z-20">
                      <div className="w-8 h-8 rounded-full bg-card border-2 border-primary/30 flex items-center justify-center">
                        <ArrowRight className="w-4 h-4 text-primary" />
                      </div>
                    </div>
                  )}

                  {/* Mobile Arrow */}
                  {index < steps.length - 1 && (
                    <div className="lg:hidden flex justify-center py-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center rotate-90">
                        <ArrowRight className="w-5 h-5 text-primary" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom CTA hint */}
        <div className="mt-16 text-center">
          <p className="text-lg text-muted-foreground">
            That's it. <span className="text-primary font-medium">Three steps</span> to understanding your course material better.
          </p>
        </div>
      </div>
    </section>
  );
}
