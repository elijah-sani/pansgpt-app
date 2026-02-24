import { ArrowRight, Clock, Shield, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import Link from "next/link";

export function MidPageCTA() {
  return (
    <section className="py-24 px-6 sm:px-8 lg:px-12 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,197,94,0.1),transparent_70%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(34,197,94,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(34,197,94,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

      <div className="container mx-auto max-w-5xl relative z-10">
        <Card className="border-2 border-primary/30 bg-gradient-to-br from-card via-card to-primary/5 overflow-hidden relative">
          {/* Accent corners */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-primary/10 rounded-full blur-3xl" />

          <CardContent className="p-12 lg:p-16 text-center space-y-8 relative z-10">
            {/* Main Headline */}
            <div className="space-y-3">
              <h2 className="text-4xl lg:text-5xl text-foreground leading-tight">
                Ready to Change the Way You Study?
              </h2>
            </div>

            {/* Subheadline */}
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              It's free, it's built for you, and it takes 30 seconds to sign up.
            </p>

            {/* CTA Button */}
            <div className="pt-4">
              <Link href="/login">
                <Button
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-lg px-8 py-6 h-auto group transition-all"
                >
                  Start Acing Your Courses (100% Free)
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>

            {/* Trust indicators */}
            <div className="flex flex-wrap items-center justify-center gap-6 lg:gap-10 pt-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-primary" />
                </div>
                <span>30 second signup</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-primary" />
                </div>
                <span>No credit card needed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <span>100% Free Forever</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
