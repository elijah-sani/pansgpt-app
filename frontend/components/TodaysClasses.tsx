'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { api } from '@/lib/api';

interface TimetableClass {
  id?: string;
  level?: string;
  time_slot?: string;
  start_time?: string;
  course_code?: string;
  course_title?: string;
}

interface TodaysClassesProps {
  onSeeAll?: () => void;
  level?: string;
}

export default function TodaysClasses({ onSeeAll, level }: TodaysClassesProps) {
  const [classes, setClasses] = useState<TimetableClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeClassIndex, setActiveClassIndex] = useState<number>(-1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    const levelDigits = (level || '').replace(/\D/g, '');

    const fetchTimetable = async () => {
      setIsLoading(true);
      try {
        const levelParam = level ? `?level=${encodeURIComponent(level)}` : '';
        const res = await api.get(`/timetable/today${levelParam}`);
        if (!res.ok) {
          throw new Error(`Failed to fetch timetable: ${res.status}`);
        }
        const payload = await res.json();
        const incoming = Array.isArray(payload?.classes) ? payload.classes : [];
        const filtered =
          levelDigits.length > 0
            ? incoming.filter((item: TimetableClass) => {
                const rowDigits = (item?.level || '').toString().replace(/\D/g, '');
                return rowDigits ? rowDigits === levelDigits : false;
              })
            : incoming;
        if (isMounted) {
          setClasses(filtered);
        }
      } catch (err) {
        console.error('Timetable fetch failed:', err);
        if (isMounted) setClasses([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void fetchTimetable();
    return () => {
      isMounted = false;
    };
  }, [level]);

  useEffect(() => {
    if (!classes.length) {
      setActiveClassIndex(-1);
      return;
    }

    const currentHour = new Date().getHours();
    let targetIndex = -1;

    for (let i = 0; i < classes.length; i++) {
      const raw = (classes[i]?.start_time || classes[i]?.time_slot || '').toString();
      const parsedHour = parseInt(raw.split(':')[0], 10);
      if (!Number.isNaN(parsedHour) && parsedHour >= currentHour) {
        targetIndex = i;
        break;
      }
    }

    if (targetIndex === -1) {
      targetIndex = currentHour < 5 ? 0 : classes.length - 1;
    }

    setActiveClassIndex(targetIndex);

    if (scrollContainerRef.current) {
      const cardWidth = 232;
      scrollContainerRef.current.scrollTo({
        left: targetIndex * cardWidth,
        behavior: 'smooth',
      });
    }
  }, [classes]);

  return (
    <div className="mt-3 flex flex-col items-center w-full">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between px-5 mb-3">
          <h3 className="text-base font-bold text-foreground">Today&apos;s Classes</h3>
          {onSeeAll ? (
            <button className="text-sm text-primary font-medium hover:underline" onClick={onSeeAll}>
              See all
            </button>
          ) : (
            <div />
          )}
        </div>

        <div
          ref={scrollContainerRef}
          className="flex gap-3 px-4 overflow-x-auto snap-x pb-4 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-primary/20 hover:[&::-webkit-scrollbar-thumb]:bg-primary/40 [&::-webkit-scrollbar-thumb]:rounded-full transition-all"
        >
          {isLoading ? (
            Array.from({ length: 2 }).map((_, idx) => (
              <div
                key={`class-skeleton-${idx}`}
                className="min-w-[220px] bg-card border border-border rounded-2xl p-4 snap-center flex flex-col gap-2 flex-shrink-0 animate-pulse"
              >
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-4 w-44 bg-muted rounded" />
                <div className="h-4 w-28 bg-muted rounded" />
              </div>
            ))
          ) : classes.length === 0 ? (
            <div className="min-w-full bg-card border border-dashed border-border rounded-2xl p-6 text-center text-sm text-muted-foreground">
              No classes scheduled for today!
            </div>
          ) : (
            classes.map((cls, idx) => (
              <div
                key={cls.id || `${cls.time_slot || 'slot'}-${cls.course_code || 'course'}-${idx}`}
                className={`min-w-[220px] max-w-[260px] bg-card border rounded-2xl p-4 snap-center flex flex-col gap-3 flex-shrink-0 ${
                  idx === activeClassIndex
                    ? 'border-primary/60 shadow-[0_0_0_1px_rgba(59,130,246,0.2),0_0_18px_rgba(59,130,246,0.1)]'
                    : 'border-border'
                }`}
              >
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary bg-primary/10 w-fit">
                  <Clock size={13} className="text-primary" />
                  <span className="text-xs font-bold text-primary">
                    {cls.time_slot || 'Time TBD'}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <h4 className="text-base font-bold text-foreground">{cls.course_code || 'Course'}</h4>
                  <p className="text-xs font-medium text-muted-foreground leading-snug line-clamp-2">
                    {cls.course_title || 'Untitled'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
