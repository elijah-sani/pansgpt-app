"use client";
import { useEffect, useRef, useState } from "react";
import { TestimonialCard } from "./TestimonialCard";

interface Testimonial {
  quote: string;
  name: string;
  role: string;
  imageUrl?: string;
}

interface InfiniteTestimonialsProps {
  testimonials: Testimonial[];
}

export function InfiniteTestimonials({ testimonials }: InfiniteTestimonialsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const [isPaused, setIsPaused] = useState(false);
  const scrollPositionRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const calculateWidth = () => {
      const firstCard = container.querySelector('.testimonial-card') as HTMLElement;
      if (firstCard) {
        const cardWidth = firstCard.offsetWidth;
        const gap = 32; // gap-8 = 32px
        return testimonials.length * (cardWidth + gap);
      }
      return testimonials.length * (400 + 32); // Fallback
    };

    // Wait for layout to calculate accurate width
    const singleSetWidth = calculateWidth();

    // Recalculate on resize
    const handleResize = () => {
      // Width will be recalculated in next frame
    };
    window.addEventListener('resize', handleResize);

    const animate = () => {
      if (!isPaused) {
        const currentWidth = calculateWidth();
        scrollPositionRef.current += 0.5; // pixels per frame

        // Reset position seamlessly when we've scrolled one full set
        if (scrollPositionRef.current >= currentWidth) {
          scrollPositionRef.current = scrollPositionRef.current - currentWidth;
        }
      }

      if (container) {
        container.style.transform = `translateX(-${scrollPositionRef.current}px)`;
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Start animation after a brief delay to ensure layout is complete
    const timeoutId = setTimeout(() => {
      animationFrameRef.current = requestAnimationFrame(animate);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [testimonials.length, isPaused]);

  // Duplicate testimonials for seamless loop - need 2 sets so first can follow last
  const duplicatedTestimonials = [...testimonials, ...testimonials];

  return (
    <div
      className="relative overflow-hidden w-full"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div
        className="flex gap-8 px-4 sm:px-6 md:px-8"
        ref={containerRef}
        style={{
          willChange: 'transform',
          transition: isPaused ? 'none' : undefined
        }}
      >
        {duplicatedTestimonials.map((testimonial, index) => (
          <div
            key={`${testimonial.name}-${index}`}
            className="flex-shrink-0 w-[90vw] sm:w-[500px] md:w-[400px] lg:w-[450px] testimonial-card"
          >
            <TestimonialCard
              quote={testimonial.quote}
              name={testimonial.name}
              role={testimonial.role}
              imageUrl={testimonial.imageUrl}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

