"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Zap,
    Brain,
    CheckCircle,
    MessageSquare,
    ListChecks,
    Lightbulb,
    ArrowRight,
    Download,
    BookOpen,
} from "lucide-react";
import Navigation from "@/components/landing/Navigation";
import Footer from "@/components/landing/Footer";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { FeatureShowcase } from "@/components/landing/FeatureShowcase";
import { ChatMockup } from "@/components/landing/ChatMockup";
import { QuizMockup } from "@/components/landing/QuizMockup";
import { FeedbackMockup } from "@/components/landing/FeedbackMockup";
import { StudyModeMockup } from "@/components/landing/StudyModeMockup";
import { TestimonialCarousel } from "@/components/landing/TestimonialCarousel";
import Link from "next/link";

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-white dark:bg-gray-950">
            {/* Navigation */}
            <Navigation />

            {/* Main Content Wrapper */}
            <div className="max-w-6xl mx-auto">
                {/* Hero Section */}
                <section className="pt-40 pb-32 px-6 sm:px-8 lg:px-12 bg-gradient-to-b from-white via-white to-green-50/30 dark:from-gray-950 dark:via-gray-950 dark:to-green-950/10">
                    <div className="container mx-auto">
                        <div className="flex flex-col items-center text-center max-w-5xl mx-auto">
                            <div className="space-y-10">
                                {/* Badge */}
                                <div>
                                    <Badge
                                        variant="secondary"
                                        className="w-fit mx-auto px-4 py-1.5 text-xs font-medium tracking-wide uppercase border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm"
                                    >
                                        Built by PANSites, for PANSites
                                    </Badge>
                                </div>

                                {/* Heading */}
                                <div className="space-y-6">
                                    <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-900 dark:text-white leading-tight tracking-tight">
                                        The Ultimate Study Hack
                                        <br />
                                        <span className="text-green-600 dark:text-green-500">
                                            for PANSites
                                        </span>
                                    </h1>

                                    <p className="text-lg sm:text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed font-light">
                                        PansGPT is a study partner built just for PANSites. It has
                                        already read all your official course notes. Ask it a
                                        question, and get a simple, correct answer in seconds.
                                    </p>
                                </div>

                                {/* CTA Buttons */}
                                <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                                    <Link href="/login">
                                        <Button
                                            size="lg"
                                            className="group px-8 py-6 text-base font-semibold bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20 hover:shadow-xl hover:shadow-green-600/30 transition-all duration-300 rounded-xl"
                                        >
                                            Start Studying Smarter
                                            <ArrowRight className="ml-2 w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Why Use PansGPT Section */}
                <section className="py-20 px-6 sm:px-8 lg:px-12">
                    <div className="container mx-auto">
                        <div className="text-center space-y-4 mb-16">
                            <h2 className="text-4xl text-gray-900 dark:text-white">
                                Pharmacy School is intense, we know, so we built <br />
                                <span className="text-green-600 dark:text-green-500">
                                    PansGPT to make sure you can...
                                </span>
                            </h2>
                        </div>

                        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                            <Card className="hover:border-green-500/50 transition-all duration-300">
                                <CardContent className="p-8 space-y-4 text-center">
                                    <div className="w-16 h-16 rounded-full bg-green-600/10 flex items-center justify-center mx-auto">
                                        <Zap className="w-8 h-8 text-green-600" />
                                    </div>
                                    <h3 className="text-gray-900 dark:text-white font-semibold text-lg">
                                        Find Answers in Seconds
                                    </h3>
                                    <p className="text-gray-500 dark:text-gray-400">
                                        No more scrolling through 10 giant PDFs to find one
                                        definition. Just ask, &ldquo;What is the mechanism of action
                                        for Metformin?&rdquo; and get the answer instantly.
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="hover:border-green-500/50 transition-all duration-300">
                                <CardContent className="p-8 space-y-4 text-center">
                                    <div className="w-16 h-16 rounded-full bg-green-600/10 flex items-center justify-center mx-auto">
                                        <Brain className="w-8 h-8 text-green-600" />
                                    </div>
                                    <h3 className="text-gray-900 dark:text-white font-semibold text-lg">
                                        Actually Learn the Topic
                                    </h3>
                                    <p className="text-gray-500 dark:text-gray-400">
                                        Don&apos;t just memorize—understand. Ask &ldquo;Why does this
                                        drug work this way?&rdquo; and get a simple explanation,
                                        based on your lecturer&apos;s exact notes.
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="hover:border-green-500/50 transition-all duration-300">
                                <CardContent className="p-8 space-y-4 text-center">
                                    <div className="w-16 h-16 rounded-full bg-green-600/10 flex items-center justify-center mx-auto">
                                        <CheckCircle className="w-8 h-8 text-green-600" />
                                    </div>
                                    <h3 className="text-gray-900 dark:text-white font-semibold text-lg">
                                        Test Yourself Before the Exam
                                    </h3>
                                    <p className="text-gray-500 dark:text-gray-400">
                                        Stop guessing what&apos;s important. Create quizzes from your
                                        notes to find out what you don&apos;t know, so you can fix it
                                        before the test.
                                    </p>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </section>

                {/* How It Works Section */}
                <HowItWorks />

                {/* Features Section */}
                <section id="features" className="py-20 px-6 sm:px-8 lg:px-12">
                    <div className="container mx-auto max-w-6xl">
                        <div className="text-center space-y-4 mb-20">
                            <h2 className="text-4xl text-gray-900 dark:text-white">
                                Everything You Need to{" "}
                                <span className="text-green-600 dark:text-green-500">
                                    Study Better
                                </span>
                            </h2>
                            <p className="text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
                                Powerful features designed specifically for pharmacy students at
                                University of Jos
                            </p>
                        </div>

                        <div className="space-y-32">
                            <FeatureShowcase
                                icon={MessageSquare}
                                title="Chat With Your Notes"
                                description="Ask questions and get answers from your entire curriculum. You can even filter by Lecturer, Course Code, and Year of Study. No more endless scrolling through PDFs—just ask and get instant, accurate answers from your course materials."
                                mockup={<ChatMockup />}
                            />

                            <FeatureShowcase
                                icon={BookOpen}
                                title="Study Mode - Read Smarter"
                                description="Read your lecture notes in a clean, distraction-free reader. Highlight any text and instantly get AI-powered explanations or memory aids. Navigate through content with ease, track your progress, and access your class timetable—all in one place."
                                mockup={<StudyModeMockup />}
                                reverse
                            />

                            <FeatureShowcase
                                icon={ListChecks}
                                title="Smart Quiz Generator"
                                description="Create quizzes that really test your understanding. It asks you questions in different ways (not just definitions) to make sure you're ready. Generate custom quizzes on any topic and identify your weak spots before exam day."
                                mockup={<QuizMockup />}
                            />

                            <FeatureShowcase
                                icon={Lightbulb}
                                title="Helpful Quiz Feedback"
                                description="Our quizzes don't just say 'correct' or 'wrong.' They explain why an answer is right, helping you learn from your mistakes. Get detailed explanations with references to your course materials so you truly understand the concepts."
                                mockup={<FeedbackMockup />}
                                reverse
                            />
                        </div>
                    </div>
                </section>

                {/* Testimonials Section */}
                <section id="testimonials" className="py-20 bg-gray-50/30 dark:bg-gray-900/30 w-full">
                    <div className="max-w-6xl mx-auto px-6 sm:px-8 lg:px-12 mb-16">
                        <div className="text-center space-y-4">
                            <h2 className="text-4xl text-gray-900 dark:text-white">
                                Built by PANSites.{" "}
                                <span className="text-green-600 dark:text-green-500">
                                    Trusted by PANSites.
                                </span>
                            </h2>
                        </div>
                    </div>

                    <div className="w-full">
                        <TestimonialCarousel
                            testimonials={[
                                {
                                    quote:
                                        "What stood out while test running the app was that it gives you concise and wholesome answers according to what you're expected to know. The tests are really helpful in gauging one's preparedness for an actual test or exam and serve as a good pre-test & post-study drill.",
                                    name: "Naomi C. Okwuzi",
                                    role: "Pharmacy Student",
                                },
                                {
                                    quote:
                                        "PansGPT is a great tool that makes studying a lot easier. It is course-specific to aid us as Pharmacy students. I personally love the quiz section.",
                                    name: "Kelvin E.",
                                    role: "Pharmacy Student",
                                },
                                {
                                    quote:
                                        "I love the fact that my responses are tailored to what was taught by the lecturer. The quiz aspect having levels of difficulty allows me to test my knowledge depending on the amount of work I've put in. Overall, using the app was very helpful.",
                                    name: "Anita Dangwam",
                                    role: "Pharmacy Student",
                                },
                                {
                                    quote:
                                        "There's so much information out there and as students we struggle with picking out the necessary ones. This Ai model being tailored to the needs of pharmacy students from the materials of the lecturers helps to ensure that not only do students get the necessary information they need but are also spared from having to waste time in gathering data they don't need or feel is important (while it might not be).",
                                    name: "Smith",
                                    role: "Pharmacy Student",
                                },
                                {
                                    quote:
                                        "We created PansGPT because we experienced the challenges of pharmacy education firsthand. We knew there had to be a smarter way to study than endless hours with scattered resources. This is the comprehensive study companion we always wished we had during our academic journey—built by students, for students.",
                                    name: "The PansGPT Team",
                                    role: "Creators & Pharmacy Alumni",
                                },
                            ]}
                        />
                    </div>
                </section>

                {/* Final CTA */}
                <section className="py-20 px-6 sm:px-8 lg:px-12">
                    <div className="container mx-auto max-w-4xl text-center space-y-8">
                        <h2 className="text-5xl text-gray-900 dark:text-white mb-12">
                            Your Next Exam is Coming. <br />
                            <span className="text-green-600 dark:text-green-500">
                                Be Ready for It.
                            </span>
                        </h2>

                        <Link href="/login">
                            <Button
                                size="lg"
                                className="bg-green-600 hover:bg-green-700 text-white"
                            >
                                Study Smarter
                                <ArrowRight className="ml-2 w-5 h-5" />
                            </Button>
                        </Link>
                    </div>
                </section>

                {/* Quote Section */}
                <section className="py-20 px-6 sm:px-8 lg:px-12">
                    <div className="container mx-auto max-w-4xl text-center">
                        <blockquote className="space-y-4">
                            <p className="text-3xl md:text-4xl text-gray-900 dark:text-white italic">
                                &ldquo;Because every PANSite deserves a friend who understands
                                it all.&rdquo;
                            </p>
                            <footer className="text-xl text-green-600 dark:text-green-500">
                                — The PansGPT Team
                            </footer>
                        </blockquote>
                    </div>
                </section>
            </div>
            {/* Footer */}
            <Footer />
        </div>
    );
}
