'use client';

import React, { useEffect, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import MobileBottomSheet from '@/components/MobileBottomSheet';

interface TimetableClass {
  id?: string;
  level?: string;
  time_slot?: string;
  course_code?: string;
  course_title?: string;
}

export default function WeeklyTimetableModal({
  isOpen,
  onClose,
  level,
}: {
  isOpen: boolean;
  onClose: () => void;
  level?: string;
}) {
  const [weekData, setWeekData] = useState<Record<string, TimetableClass[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Monday');

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    const levelDigits = (level || '').replace(/\D/g, '');

    const fetchWeek = async () => {
      setIsLoading(true);
      try {
        const levelParam = level ? `?level=${encodeURIComponent(level)}` : '';
        const res = await api.get(`/timetable/week${levelParam}`);
        if (!res.ok) {
          throw new Error(`Failed to fetch weekly timetable: ${res.status}`);
        }
        const payload = await res.json();
        if (mounted) {
          const grouped = (payload || {}) as Record<string, TimetableClass[]>;
          if (!levelDigits) {
            setWeekData(grouped);
            return;
          }

          const safeGrouped: Record<string, TimetableClass[]> = {};
          Object.entries(grouped).forEach(([day, classes]) => {
            safeGrouped[day] = (Array.isArray(classes) ? classes : []).filter((item) => {
              const rowDigits = (item?.level || '').toString().replace(/\D/g, '');
              return rowDigits ? rowDigits === levelDigits : false;
            });
          });
          setWeekData(safeGrouped);
        }
      } catch (err) {
        console.error('Weekly timetable fetch failed:', err);
        if (mounted) setWeekData({});
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void fetchWeek();
    return () => {
      mounted = false;
    };
  }, [isOpen, level]);

  if (!isOpen) return null;

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const activeClasses = Array.isArray(weekData[activeTab]) ? weekData[activeTab] : [];
  const modalContent = (
    <>
      <div className="p-5 border-b border-border flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Weekly Timetable</h2>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      <div className="border-b border-border px-4 pt-3">
        <div className="flex gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-primary/20 [&::-webkit-scrollbar-thumb]:rounded-full">
          {days.map((day) => (
            <button
              key={day}
              onClick={() => setActiveTab(day)}
              className={`px-4 py-2 text-sm rounded-lg whitespace-nowrap border-b-2 transition-colors ${
                activeTab === day
                  ? 'text-primary border-primary bg-primary/10 font-semibold'
                  : 'text-muted-foreground border-transparent hover:text-foreground'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 overflow-y-auto bg-background/40 flex-1">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={`week-skeleton-${idx}`} className="h-20 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : activeClasses.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-8 text-center text-muted-foreground">
            No classes on this day!
          </div>
        ) : (
          <div className="space-y-3">
            {activeClasses.map((cls, idx) => (
              <div
                key={cls.id || `${activeTab}-${cls.time_slot || 'slot'}-${cls.course_code || 'course'}-${idx}`}
                className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3"
              >
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary bg-primary/10 w-fit">
                  <span className="text-xs font-bold text-primary">{cls.time_slot || 'Time TBD'}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <h4 className="text-base font-bold text-foreground">{cls.course_code || 'Course'}</h4>
                  <p className="text-xs font-medium text-muted-foreground leading-snug">{cls.course_title || 'Untitled'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      <MobileBottomSheet isOpen={isOpen} onClose={onClose}>
        <div className="bg-card flex flex-col max-h-[90vh]">
          {modalContent}
        </div>
      </MobileBottomSheet>

      <div className="hidden md:block">
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4"
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {modalContent}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}
