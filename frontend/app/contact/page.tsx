"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { motion } from "framer-motion";
import { 
  Bug,
  Lightbulb,
  HelpCircle,
  BookOpen,
  Heart,
  Send,
  Upload,
  CheckCircle,
  ExternalLink,
  CreditCard
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import Navigation from "@/components/landing/Navigation";
import Footer from "@/components/landing/Footer";

export default function ContactPage() {
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [contributeOpen, setContributeOpen] = useState(false);

  const handleBugReport = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Thank you! Your bug report has been submitted. We'll investigate this right away.");
    setBugReportOpen(false);
  };

  const handleFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Thank you for your feedback! We read every message and your ideas help shape PansGPT.");
    setFeedbackOpen(false);
  };

  const handleQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Question received! We'll get back to you as soon as possible.");
    setQuestionOpen(false);
  };

  const handleContribute = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Application submitted! We'll review your request and contact you soon. Thank you for helping the community!");
    setContributeOpen(false);
  };

  return (
    <div className="min-h-screen bg-background dark">
      {/* Navigation */}
      <Navigation />

      {/* Hero Section */}
      <section className="pt-32 pb-12 px-6 sm:px-8 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <motion.div 
            className="text-center space-y-6"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl lg:text-6xl text-foreground">
              Get in Touch
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              We're a team of fellow PANSites, and we're here to help. Whether you have an idea, found a problem, or just want to say hi, 
              we read every message. Please choose the best option below so we can help you as quickly as possible.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Contact Options Grid */}
      <section className="pb-20 px-6 sm:px-8 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* 1. Report a Problem */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <Card className="bg-card border-border h-full hover:border-primary/50 transition-all duration-300">
                <CardContent className="pt-6 flex flex-col h-full">
                  <div className="w-12 h-12 rounded-lg bg-red-500/10 flex items-center justify-center mb-4">
                    <Bug className="w-6 h-6 text-red-500" />
                  </div>
                  
                  <h3 className="text-foreground mb-3 flex items-center gap-2">
                    🐞 Report a Problem
                  </h3>
                  
                  <p className="text-muted-foreground text-sm mb-6 flex-grow">
                    Did the app crash? Did an AI answer seem <em>completely</em> wrong? We are so sorry about that! 
                    You're helping us make PansGPT better for everyone by reporting bugs. Please be as detailed as possible.
                  </p>
                  
                  <Dialog open={bugReportOpen} onOpenChange={setBugReportOpen}>
                    <DialogTrigger asChild>
                      <Button className="w-full bg-red-500 hover:bg-red-600 text-white">
                        <Bug className="w-4 h-4 mr-2" />
                        Report Bug
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Report a Problem</DialogTitle>
                        <DialogDescription>
                          Help us fix this issue by providing as much detail as possible.
                        </DialogDescription>
                      </DialogHeader>
                      
                      <form onSubmit={handleBugReport} className="space-y-4 pt-4">
                        <div>
                          <Label htmlFor="bug-email">Your Email *</Label>
                          <Input id="bug-email" type="email" required placeholder="your.email@example.com" />
                        </div>
                        
                        <div>
                          <Label htmlFor="bug-page">What page were you on? *</Label>
                          <Select required>
                            <SelectTrigger id="bug-page">
                              <SelectValue placeholder="Select page" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="chat">Chat</SelectItem>
                              <SelectItem value="quiz">Quiz</SelectItem>
                              <SelectItem value="profile">Profile</SelectItem>
                              <SelectItem value="settings">Settings</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div>
                          <Label htmlFor="bug-action">What did you do? *</Label>
                          <Textarea 
                            id="bug-action" 
                            required 
                            placeholder="E.g., I typed '...', I clicked '...'"
                            rows={3}
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor="bug-expected">What did you expect to happen? *</Label>
                          <Textarea 
                            id="bug-expected" 
                            required 
                            placeholder="Describe what should have happened"
                            rows={2}
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor="bug-actual">What actually happened? *</Label>
                          <Textarea 
                            id="bug-actual" 
                            required 
                            placeholder="E.g., The app crashed, I got a weird answer, The button didn't work"
                            rows={3}
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor="bug-screenshot">Can you upload a screenshot? (Optional, but very helpful)</Label>
                          <div className="mt-2 flex items-center gap-2">
                            <Button type="button" variant="outline" className="w-full">
                              <Upload className="w-4 h-4 mr-2" />
                              Choose File
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 5MB</p>
                        </div>
                        
                        <Button type="submit" className="w-full bg-red-500 hover:bg-red-600 text-white">
                          <Send className="w-4 h-4 mr-2" />
                          Submit Report
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            </motion.div>

            {/* 2. Submit Feedback */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <Card className="bg-card border-border h-full hover:border-primary/50 transition-all duration-300">
                <CardContent className="pt-6 flex flex-col h-full">
                  <div className="w-12 h-12 rounded-lg bg-yellow-500/10 flex items-center justify-center mb-4">
                    <Lightbulb className="w-6 h-6 text-yellow-500" />
                  </div>
                  
                  <h3 className="text-foreground mb-3 flex items-center gap-2">
                    💡 Share Your Feedback
                  </h3>
                  
                  <p className="text-muted-foreground text-sm mb-6 flex-grow">
                    Have an idea for a new feature? A suggestion for how we can make studying easier? We <em>love</em> hearing your ideas. 
                    We are building this for you, and your feedback is what guides us.
                  </p>
                  
                  <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
                    <DialogTrigger asChild>
                      <Button className="w-full bg-yellow-500 hover:bg-yellow-600 text-white">
                        <Lightbulb className="w-4 h-4 mr-2" />
                        Share Feedback
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Share Your Feedback</DialogTitle>
                        <DialogDescription>
                          Your ideas help us build a better PansGPT for everyone.
                        </DialogDescription>
                      </DialogHeader>
                      
                      <form onSubmit={handleFeedback} className="space-y-4 pt-4">
                        <div>
                          <Label htmlFor="feedback-email">Your Email (Optional)</Label>
                          <Input id="feedback-email" type="email" placeholder="your.email@example.com" />
                          <p className="text-xs text-muted-foreground mt-1">Leave blank if you'd like to remain anonymous</p>
                        </div>
                        
                        <div>
                          <Label htmlFor="feedback-message">Your Idea / Feedback *</Label>
                          <Textarea 
                            id="feedback-message" 
                            required 
                            placeholder="E.g., You should add..., I really like..., It would be cooler if..."
                            rows={6}
                          />
                        </div>
                        
                        <Button type="submit" className="w-full bg-yellow-500 hover:bg-yellow-600 text-white">
                          <Send className="w-4 h-4 mr-2" />
                          Submit Feedback
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            </motion.div>

            {/* 3. Ask a Question */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card className="bg-card border-border h-full hover:border-primary/50 transition-all duration-300">
                <CardContent className="pt-6 flex flex-col h-full">
                  <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4">
                    <HelpCircle className="w-6 h-6 text-blue-500" />
                  </div>
                  
                  <h3 className="text-foreground mb-3 flex items-center gap-2">
                    ❓ Ask a General Question
                  </h3>
                  
                  <p className="text-muted-foreground text-sm mb-6 flex-grow">
                    Have a question about our team, our mission, or how PansGPT works? (Please note: <strong>This is not for academic questions</strong>—that's what the app is for!) 
                    We'll get back to you as soon as we can.
                  </p>
                  
                  <Dialog open={questionOpen} onOpenChange={setQuestionOpen}>
                    <DialogTrigger asChild>
                      <Button className="w-full bg-blue-500 hover:bg-blue-600 text-white">
                        <HelpCircle className="w-4 h-4 mr-2" />
                        Ask Question
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Ask a General Question</DialogTitle>
                        <DialogDescription>
                          We're here to help! Ask us anything about PansGPT.
                        </DialogDescription>
                      </DialogHeader>
                      
                      <form onSubmit={handleQuestion} className="space-y-4 pt-4">
                        <div>
                          <Label htmlFor="question-email">Your Email *</Label>
                          <Input id="question-email" type="email" required placeholder="your.email@example.com" />
                        </div>
                        
                        <div>
                          <Label htmlFor="question-message">Your Question *</Label>
                          <Textarea 
                            id="question-message" 
                            required 
                            placeholder="What would you like to know about PansGPT?"
                            rows={5}
                          />
                        </div>
                        
                        <Button type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white">
                          <Send className="w-4 h-4 mr-2" />
                          Send Question
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            </motion.div>

            {/* 4. Contribute Notes */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Card className="bg-card border-border h-full hover:border-primary/50 transition-all duration-300">
                <CardContent className="pt-6 flex flex-col h-full">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <BookOpen className="w-6 h-6 text-primary" />
                  </div>
                  
                  <h3 className="text-foreground mb-3 flex items-center gap-2">
                    📚 Contribute to the Library
                  </h3>
                  
                  <p className="text-muted-foreground text-sm mb-6 flex-grow">
                    Our goal is to have the most complete, up-to-date library of <em>all</em> official course materials. 
                    If you are a Class Rep or have high-quality, verified notes that you have the <strong>permission to share</strong>, 
                    you can help thousands of fellow PANSites. Please apply here, and our team will get in touch.
                  </p>
                  
                  <Dialog open={contributeOpen} onOpenChange={setContributeOpen}>
                    <DialogTrigger asChild>
                      <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                        <BookOpen className="w-4 h-4 mr-2" />
                        Apply to Contribute
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Contribute to the Library</DialogTitle>
                        <DialogDescription>
                          Help your fellow students by sharing verified course materials.
                        </DialogDescription>
                      </DialogHeader>
                      
                      <form onSubmit={handleContribute} className="space-y-4 pt-4">
                        <div>
                          <Label htmlFor="contrib-name">Your Full Name *</Label>
                          <Input id="contrib-name" required placeholder="John Doe" />
                        </div>
                        
                        <div>
                          <Label htmlFor="contrib-email">Your Email *</Label>
                          <Input id="contrib-email" type="email" required placeholder="your.email@example.com" />
                        </div>
                        
                        <div>
                          <Label htmlFor="contrib-level">Your Academic Level *</Label>
                          <Select required>
                            <SelectTrigger id="contrib-level">
                              <SelectValue placeholder="Select your level" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="100">100 Level</SelectItem>
                              <SelectItem value="200">200 Level</SelectItem>
                              <SelectItem value="300">300 Level</SelectItem>
                              <SelectItem value="400">400 Level</SelectItem>
                              <SelectItem value="500">500 Level</SelectItem>
                              <SelectItem value="alumni">Alumni</SelectItem>
                              <SelectItem value="staff">Staff</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div>
                          <Label htmlFor="contrib-courses">What course(s) are the notes for? *</Label>
                          <Input 
                            id="contrib-courses" 
                            required 
                            placeholder="E.g., PCH 301, PCH 303"
                          />
                        </div>
                        
                        <div className="flex items-start space-x-2 pt-2">
                          <Checkbox id="contrib-permission" required />
                          <Label 
                            htmlFor="contrib-permission" 
                            className="text-sm leading-relaxed cursor-pointer"
                          >
                            I confirm that I have the right to share these materials 
                            (e.g., "They are my personal notes," "I am the class rep and our class agreed to share this")
                          </Label>
                        </div>
                        
                        <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                          <Send className="w-4 h-4 mr-2" />
                          Apply to Contribute
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            </motion.div>

            {/* 5. Support PansGPT - Spans 2 columns on large screens */}
            <motion.div
              className="lg:col-span-2"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20 h-full">
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-grow">
                      <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mb-4">
                        <Heart className="w-6 h-6 text-primary" />
                      </div>
                      
                      <h3 className="text-foreground mb-3 flex items-center gap-2">
                        ❤️ Help Keep PansGPT Free
                      </h3>
                      
                      <p className="text-muted-foreground text-sm mb-4">
                        PansGPT is 100% free for all PANSites, but it is <strong>not free for us to run</strong>. 
                        We pay for powerful servers, AI model access, and database hosting every single month.
                      </p>
                      
                      <p className="text-muted-foreground text-sm mb-6">
                        If you find this tool helpful and want to help us cover those costs, please consider a small donation. 
                        Every "thank you" donation helps keep the lights on for everyone.
                      </p>
                    </div>
                    
                    <div className="md:w-80 bg-card border border-border rounded-lg p-4">
                      <h4 className="text-foreground text-sm mb-3 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-primary" />
                        Or Send Directly
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Bank Name:</span>
                          <p className="text-foreground">Access Bank</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Account Name:</span>
                          <p className="text-foreground">PansGPT Development</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Account Number:</span>
                          <p className="text-foreground">1234567890</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-3 italic">
                        Using a payment processor is more secure and helps us track donations.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="pb-20 px-6 sm:px-8 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="bg-card border-border">
              <CardContent className="pt-6 text-center">
                <h3 className="text-foreground mb-3">
                  Can't Find What You're Looking For?
                </h3>
                <p className="text-muted-foreground mb-4">
                  Feel free to reach out via any of the options above. We're here to help and we read every message!
                </p>
                <p className="text-sm text-muted-foreground">
                  Response time: Usually within 24-48 hours
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}

