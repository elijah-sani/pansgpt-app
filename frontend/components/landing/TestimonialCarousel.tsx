"use client";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "../ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "../ui/avatar";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { Button } from "../ui/button";

interface Testimonial {
  quote: string;
  name: string;
  role: string;
  imageUrl?: string;
}

interface TestimonialCarouselProps {
  testimonials: Testimonial[];
}

export function TestimonialCarousel({ testimonials }: TestimonialCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? testimonials.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === testimonials.length - 1 ? 0 : prev + 1));
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  // Auto-play functionality
  useEffect(() => {
    if (isPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev === testimonials.length - 1 ? 0 : prev + 1));
    }, 5000); // Switch every 5 seconds

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPaused, testimonials.length]);

  const currentTestimonial = testimonials[currentIndex];

  return (
    <div 
      className="w-full px-4 sm:px-6 lg:px-8"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Navigation Controls */}
      <div className="flex items-center justify-between mb-8 max-w-[630px] mx-auto">
        <Button
          variant="outline"
          size="icon"
          onClick={goToPrevious}
          className="rounded-full bg-muted/50 hover:bg-muted border-border"
          aria-label="Previous testimonial"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>

        {/* Pagination Dots */}
        <div className="flex gap-2 items-center">
          {testimonials.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`h-1 rounded-full transition-all ${
                index === currentIndex
                  ? "bg-primary w-8"
                  : "bg-gray-400 hover:bg-gray-300 w-2"
              }`}
              aria-label={`Go to testimonial ${index + 1}`}
            />
          ))}
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={goToNext}
          className="rounded-full bg-muted/50 hover:bg-muted border-border"
          aria-label="Next testimonial"
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Testimonial Card */}
      <Card className="bg-card border-border max-w-[630px] mx-auto">
        <CardContent className="p-6 sm:p-8">
          <div className="space-y-6">
            {/* Star Rating */}
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className="w-5 h-5 fill-yellow-500 text-yellow-500"
                />
              ))}
            </div>

            {/* Quote */}
            <p className="text-foreground text-lg sm:text-xl leading-relaxed">
              {currentTestimonial.quote}
            </p>

            {/* Author Info */}
            <div className="flex items-center gap-4 pt-4 border-t border-border">
              <Avatar className="w-14 h-14">
                {currentTestimonial.imageUrl ? (
                  <AvatarImage src={currentTestimonial.imageUrl} alt={currentTestimonial.name} />
                ) : null}
                <AvatarFallback className="bg-primary/20 text-primary font-semibold text-lg">
                  {getInitials(currentTestimonial.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-foreground font-semibold text-lg">
                  {currentTestimonial.name}
                </p>
                <p className="text-muted-foreground text-sm">
                  {currentTestimonial.role}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

