"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { motion } from "framer-motion";
import {
  Download,
  Smartphone,
  CheckCircle,
  Clock,
  Shield,
  Zap,
  BookOpen,
  Apple,
  ArrowRight,
  Share2,
  Home,
  Sparkles,
  Target,
  TrendingUp,
  FileCheck,
  PlayCircle,
  Brain
} from "lucide-react";
import Navigation from "@/components/landing/Navigation";
import Footer from "@/components/landing/Footer";
import { analytics } from "@/lib/analytics";

export default function DownloadPage() {

  return (
    <div className="min-h-screen bg-background dark">
      {/* Navigation */}
      <Navigation />

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 sm:px-8 lg:px-12 overflow-hidden">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Text Content */}
            <motion.div
              className="space-y-6"
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Badge className="bg-primary/10 text-primary border-primary/20">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Download Available Now
                </Badge>
              </motion.div>

              <motion.h1
                className="text-5xl lg:text-6xl text-foreground"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                Get PANSGPT on Your Phone
              </motion.h1>

              <motion.p
                className="text-xl text-muted-foreground"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                Study smarter with PANSGPT right in your pocket. Access your personalized pharmacy tutor anytime, anywhere.
              </motion.p>

              <motion.div
                className="flex flex-col sm:flex-row gap-4 pt-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <Button
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  asChild
                >
                  <a
                    href="/apk/pansgpt.apk"
                    download
                    onClick={() => analytics.trackDownloadClick('hero_section')}
                  >
                    <Download className="w-5 h-5 mr-2" />
                    Download for Android
                  </a>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                >
                  <a href="#ios-instructions">
                    <Apple className="w-5 h-5 mr-2" />
                    iOS Instructions
                  </a>
                </Button>
              </motion.div>

              {/* Trust Indicators */}
              <motion.div
                className="flex flex-wrap gap-6 pt-6 border-t border-border"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Shield className="w-5 h-5 text-primary" />
                  <span>100% Safe</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="w-5 h-5 text-primary" />
                  <span>Instant Setup</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Smartphone className="w-5 h-5 text-primary" />
                  <span>Native Experience</span>
                </div>
              </motion.div>
            </motion.div>

            {/* Visual Mockup */}
            <motion.div
              className="relative"
              initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              <div className="absolute inset-0 bg-primary/20 blur-[120px] rounded-full animate-pulse"></div>
              <div className="relative">
                <ImageWithFallback
                  src="https://res.cloudinary.com/djqcs2ngt/image/upload/v1769331612/PG_pm3hhr.png"
                  alt="PANSGPT App Mockup"
                  className="w-full h-auto rounded-2xl"
                />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Why Download Section */}
      <section className="py-20 px-6 sm:px-8 lg:px-12 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl lg:text-5xl text-foreground mb-4">
              Why Download PANSGPT?
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Experience the full power of your personalized pharmacy tutor with our native app
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Smartphone,
                title: "Native App Experience",
                description: "Get a dedicated app with push notifications, better performance, and a seamless experience designed specifically for your phone.",
                color: "text-blue-500"
              },
              {
                icon: Zap,
                title: "Faster Performance",
                description: "Native app means instant loading, smoother animations, and quicker responses. No waiting for web pages to load.",
                color: "text-yellow-500"
              },
              {
                icon: BookOpen,
                title: "One Tap Access",
                description: "Launch PANSGPT directly from your home screen. No need to open a browser or bookmark a link.",
                color: "text-primary"
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="bg-card border-border h-full">
                  <CardContent className="pt-6">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                      <feature.icon className={`w-6 h-6 ${feature.color}`} />
                    </div>
                    <h3 className="text-foreground mb-2">{feature.title}</h3>
                    <p className="text-muted-foreground">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Download for Android Section */}
      <section className="py-20 px-6 sm:px-8 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Badge className="bg-primary/10 text-primary border-primary/20 mb-4">
              <Download className="w-3 h-3 mr-1" />
              Available Now
            </Badge>
            <h2 className="text-4xl lg:text-5xl text-foreground mb-4">
              Download PANSGPT for Android
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              You can now download PANSGPT directly — no Play Store required. After downloading, simply install the file and start learning instantly.
            </p>
          </motion.div>

          {/* Installation Steps */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {[
              { step: 1, icon: Download, title: "Tap Download", description: "Click the button below to download the APK file" },
              { step: 2, icon: FileCheck, title: "Open File", description: "Find the downloaded file in your notifications" },
              { step: 3, icon: Shield, title: "Allow Installation", description: "Tap 'Install' and grant permission" },
              { step: 4, icon: Sparkles, title: "Start Learning", description: "Open PANSGPT and ace your exams" }
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="bg-card border-border h-full">
                  <CardContent className="pt-6 text-center">
                    <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto mb-4">
                      <span className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm">
                        {item.step}
                      </span>
                      <item.icon className="w-7 h-7 text-primary" />
                    </div>
                    <h4 className="text-foreground mb-2">{item.title}</h4>
                    <p className="text-muted-foreground text-sm">
                      {item.description}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Download Button */}
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Button
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-12"
              asChild
            >
              <a
                href="/apk/pansgpt.apk"
                download
                onClick={() => analytics.trackDownloadClick('download_section')}
              >
                <Download className="w-5 h-5 mr-2" />
                Download PANSGPT (Android APK)
              </a>
            </Button>
            <p className="text-sm text-muted-foreground mt-4">
              File size: ~6MB • Version 1.0.0 • Last updated: November 2025
            </p>
          </motion.div>

          {/* Security Note */}
          <motion.div
            className="mt-12"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-6">
                <div className="flex gap-4">
                  <Shield className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <h4 className="text-foreground mb-2">Safe & Secure Download</h4>
                    <p className="text-muted-foreground text-sm">
                      Our APK is digitally signed and verified. If your device shows a security warning about "unknown sources,"
                      it's normal — just go to your settings and allow installation from this source. PANSGPT is completely safe and built specifically for University of Jos Pharmacy students.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* How to Add to Home Screen (iOS) */}
      <section id="ios-instructions" className="py-20 px-6 sm:px-8 lg:px-12 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl lg:text-5xl text-foreground mb-4">
              How to Add PANSGPT to Your Home Screen
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              You can add PANSGPT to your iPhone like a regular app. Here's how:
            </p>
          </motion.div>

          {/* Visual Guide */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-4">
                    <PlayCircle className="w-8 h-8 text-primary flex-shrink-0" />
                    <div>
                      <h4 className="text-foreground mb-1">Need a visual guide?</h4>
                      <p className="text-muted-foreground text-sm">
                        Watch this short video showing each step. You'll have PANSGPT installed in less than 30 seconds.
                      </p>
                    </div>
                  </div>
                  <div className="relative w-full max-w-2xl mx-auto rounded-lg overflow-hidden bg-black/10 border border-border">
                    <video
                      className="w-full h-auto max-h-[600px]"
                      controls
                      muted
                      loop
                      poster="/uploads/Logo.png"
                      preload="metadata"
                    >
                      <source src="https://res.cloudinary.com/djqcs2ngt/video/upload/v1764905428/ios_kqzykb.mp4" type="video/mp4" />
                      Your browser does not support the video tag.
                    </video>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 px-6 sm:px-8 lg:px-12 bg-gradient-to-br from-primary/10 via-background to-background border-y border-border">
        <div className="max-w-6xl mx-auto text-center">
          <motion.div
            className="mb-8"
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto mb-6"
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <Brain className="w-10 h-10 text-primary" />
            </motion.div>
            <h2 className="text-4xl lg:text-5xl text-foreground mb-4">
              Your Study Just Got Easier
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              Don't waste time searching online for answers that don't match your notes. With PANSGPT, every explanation is built around your pharmacy lectures — clear, local, and reliable.
            </p>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            className="flex flex-col sm:flex-row gap-4 justify-center mb-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Button
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-8"
              asChild
            >
              <a
                href="/apk/pansgpt.apk"
                download
                onClick={() => analytics.trackDownloadClick('final_cta')}
              >
                <Download className="w-5 h-5 mr-2" />
                Download for Android
              </a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-border hover:bg-muted"
              asChild
            >
              <a href="#ios-instructions">
                <Apple className="w-5 h-5 mr-2" />
                Add to iPhone
              </a>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}
