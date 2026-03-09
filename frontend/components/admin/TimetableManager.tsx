'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { CalendarDays, Clock3, Check, Loader2, Pencil, Plus, Trash2, UploadCloud, X, Filter } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

type TimetableEntry = {
  id: string;
  level: string;
  day: string;
  time_slot: string;
  start_time?: string | null;
  course_code: string;
  course_title: string;
};

type EditPayload = {
  id: string;
  day: string;
  time_slot: string;
  start_time: string;
  course_code: string;
  course_title: string;
};

const LEVELS = ['100', '200', '300', '400', '500'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function TimetableManager() {
  const [selectedLevel, setSelectedLevel] = useState('400');
  const [selectedDay, setSelectedDay] = useState('Monday');
  const [timetableData, setTimetableData] = useState<TimetableEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [editingEntry, setEditingEntry] = useState<EditPayload | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadLevel, setUploadLevel] = useState('400');
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      level: selectedLevel,
      day: selectedDay,
    });
    return params.toString();
  }, [selectedDay, selectedLevel]);

  const fetchTimetable = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get(`/admin/timetable?${queryString}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch timetable: ${res.status}`);
      }
      const payload = await res.json();
      setTimetableData(Array.isArray(payload?.data) ? payload.data : []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load timetable data.');
      setTimetableData([]);
    } finally {
      setIsLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void fetchTimetable();
  }, [fetchTimetable]);

  const handleUpload = async () => {
    if (!csvFile) {
      toast.error('Please choose a CSV file first.');
      return;
    }

    const formData = new FormData();
    formData.append('file', csvFile);
    formData.append('level', uploadLevel);

    setIsUploading(true);
    try {
      const res = await api.fetch('/admin/timetable/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || `Upload failed (${res.status})`);
      }

      const payload = await res.json();
      toast.success(`Upload successful (${payload?.processed_rows ?? 0} rows).`);
      setUploadSuccess(true);
      setCsvFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchTimetable();
      setTimeout(() => {
        setUploadSuccess(false);
        setIsUploadModalOpen(false);
      }, 900);
    } catch (err) {
      console.error(err);
      toast.error('CSV upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const openEditModal = (entry: TimetableEntry) => {
    setEditingEntry({
      id: entry.id,
      day: entry.day || selectedDay,
      time_slot: entry.time_slot || '',
      start_time: entry.start_time || '',
      course_code: entry.course_code || '',
      course_title: entry.course_title || '',
    });
  };

  const closeEditModal = () => {
    if (isSavingEdit) return;
    setEditingEntry(null);
  };

  const handleSaveEdit = async () => {
    if (!editingEntry) return;

    const payload = {
      day: editingEntry.day.trim(),
      time_slot: editingEntry.time_slot.trim(),
      start_time: editingEntry.start_time.trim(),
      course_code: editingEntry.course_code.trim(),
      course_title: editingEntry.course_title.trim(),
    };

    if (!payload.day || !payload.time_slot || !payload.course_code || !payload.course_title) {
      toast.error('Day, time slot, course code, and course title are required.');
      return;
    }

    setIsSavingEdit(true);
    try {
      const res = await api.fetch(`/admin/timetable/${editingEntry.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || `Update failed (${res.status})`);
      }
      toast.success('Class updated successfully.');
      setEditingEntry(null);
      await fetchTimetable();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update class.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await api.delete(`/admin/timetable/${id}`);
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || `Delete failed (${res.status})`);
      }
      toast.success('Class deleted.');
      await fetchTimetable();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete class.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearTimetable = async () => {
    setIsClearing(true);
    try {
      const res = await api.delete(`/admin/timetable/level/${selectedLevel}`);
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || `Clear failed (${res.status})`);
      }
      setIsClearModalOpen(false);
      toast.success(`Cleared timetable for ${selectedLevel} level.`);
      await fetchTimetable();
    } catch (err) {
      console.error(err);
      toast.error('Failed to clear timetable.');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Timetable Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage class schedules by level and day, and bulk upload via CSV.
          </p>
        </div>

        <div className="relative group">
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            className="appearance-none bg-card border border-border rounded-xl px-4 py-2.5 pr-8 text-sm font-medium focus:outline-none focus:border-primary/50 cursor-pointer hover:bg-muted transition-colors"
            title="Filter by level"
          >
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {level} Level
              </option>
            ))}
          </select>
          <Filter className="w-4 h-4 text-muted-foreground absolute right-3 top-3 pointer-events-none" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-border/60 bg-card p-3">
        {DAYS.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => setSelectedDay(day)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              selectedDay === day
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                : 'text-foreground hover:bg-accent'
            }`}
          >
            {day}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <button
            type="button"
            onClick={() => {
              setUploadLevel(selectedLevel);
              setCsvFile(null);
              setUploadSuccess(false);
              setIsUploadModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] hover:bg-primary/90 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Upload Timetable CSV
          </button>

          <button
            type="button"
            onClick={() => setIsClearModalOpen(true)}
            disabled={timetableData.length === 0 || isClearing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            Clear Timetable
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/35 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-4 font-semibold">Time</th>
                <th className="px-5 py-4 font-semibold">Course Code</th>
                <th className="px-5 py-4 font-semibold">Course Title</th>
                <th className="px-5 py-4 font-semibold">Day</th>
                <th className="px-5 py-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={`loading-${idx}`} className="animate-pulse">
                    <td className="px-5 py-4"><div className="h-4 w-28 rounded bg-muted" /></td>
                    <td className="px-5 py-4"><div className="h-4 w-20 rounded bg-muted" /></td>
                    <td className="px-5 py-4"><div className="h-4 w-64 rounded bg-muted" /></td>
                    <td className="px-5 py-4"><div className="h-4 w-20 rounded bg-muted" /></td>
                    <td className="px-5 py-4"><div className="ml-auto h-8 w-28 rounded bg-muted" /></td>
                  </tr>
                ))
              ) : timetableData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center">
                    <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30">
                        <CalendarDays className="h-6 w-6 text-muted-foreground/70" />
                      </div>
                      <p className="text-base font-semibold text-foreground">No classes found</p>
                      <p className="text-sm text-muted-foreground">
                        No timetable entries for {selectedLevel} level on {selectedDay}.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                timetableData.map((entry) => (
                  <tr key={entry.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-5 py-4 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <Clock3 className="h-4 w-4 text-primary" />
                        {entry.time_slot}
                      </div>
                    </td>
                    <td className="px-5 py-4 font-semibold text-foreground">{entry.course_code}</td>
                    <td className="px-5 py-4 text-foreground/90">{entry.course_title}</td>
                    <td className="px-5 py-4 text-foreground/80">{entry.day}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(entry)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(entry.id)}
                          disabled={deletingId === entry.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingId === entry.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-border/60 bg-card shadow-2xl">
            <div className="flex items-start justify-between border-b border-border/60 px-6 py-5">
              <div>
                <h3 className="text-lg font-semibold text-card-foreground">Edit Timetable Entry</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Update class details and save changes.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                disabled={isSavingEdit}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 px-6 py-6 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Day</label>
                <select
                  value={editingEntry.day}
                  onChange={(e) => setEditingEntry((prev) => (prev ? { ...prev, day: e.target.value } : prev))}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                >
                  {DAYS.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Time Slot</label>
                <input
                  value={editingEntry.time_slot}
                  onChange={(e) =>
                    setEditingEntry((prev) => (prev ? { ...prev, time_slot: e.target.value } : prev))
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Start Time (Optional)</label>
                <input
                  value={editingEntry.start_time}
                  onChange={(e) =>
                    setEditingEntry((prev) => (prev ? { ...prev, start_time: e.target.value } : prev))
                  }
                  placeholder="e.g. 10:00"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Course Code</label>
                <input
                  value={editingEntry.course_code}
                  onChange={(e) =>
                    setEditingEntry((prev) => (prev ? { ...prev, course_code: e.target.value } : prev))
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Course Title</label>
                <input
                  value={editingEntry.course_title}
                  onChange={(e) =>
                    setEditingEntry((prev) => (prev ? { ...prev, course_title: e.target.value } : prev))
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border/60 px-6 py-5">
              <button
                type="button"
                onClick={closeEditModal}
                disabled={isSavingEdit}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveEdit()}
                disabled={isSavingEdit}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card shadow-2xl">
            <div className="border-b border-border/60 px-6 py-5">
              <h3 className="text-lg font-semibold text-card-foreground">Clear {selectedLevel} Timetable?</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Are you sure you want to delete ALL classes for this level? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-5">
              <button
                type="button"
                onClick={() => setIsClearModalOpen(false)}
                disabled={isClearing}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleClearTimetable()}
                disabled={isClearing}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isClearing && <Loader2 className="h-4 w-4 animate-spin" />}
                Yes, Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isUploadModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg bg-background border border-border rounded-2xl shadow-2xl overflow-hidden relative"
            >
              {!uploadSuccess && !isUploading && (
                <div className="flex justify-between items-center px-5 py-4 border-b border-border bg-muted/30">
                  <h3 className="text-base font-bold text-foreground tracking-wide">UPLOAD TIMETABLE CSV</h3>
                  <button
                    onClick={() => setIsUploadModalOpen(false)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}

              <AnimatePresence mode="wait">
                {!uploadSuccess && !isUploading && (
                  <motion.div
                    key="upload-form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="p-5 space-y-5"
                  >
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
                        Upload Level
                      </label>
                      <select
                        value={uploadLevel}
                        onChange={(e) => setUploadLevel(e.target.value)}
                        className="w-full bg-muted/50 border border-border text-foreground text-sm rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:bg-background transition-all"
                      >
                        {LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="relative group cursor-pointer">
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        ref={fileInputRef}
                        onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                        className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
                      />
                      <div
                        className={`h-32 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all duration-300 ${
                          csvFile
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-border bg-muted/30 group-hover:border-primary/30 group-hover:bg-muted/50'
                        }`}
                      >
                        <div className="p-3 rounded-full bg-background mb-2 group-hover:-translate-y-1 transition-transform duration-300 shadow-sm border border-border">
                          <UploadCloud className={`w-6 h-6 ${csvFile ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          {csvFile?.name || 'Drag & drop CSV here or browse'}
                        </p>
                        {!csvFile && <p className="text-xs text-muted-foreground mt-1">Expected headers: day, time_slot, course_code, course_title, start_time(optional)</p>}
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsUploadModalOpen(false)}
                        className="px-5 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleUpload()}
                        className="px-6 py-2.5 rounded-xl text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-95"
                      >
                        Confirm Upload
                      </button>
                    </div>
                  </motion.div>
                )}

                {isUploading && !uploadSuccess && (
                  <motion.div
                    key="uploading"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    className="flex flex-col items-center justify-center h-72 text-center p-8"
                  >
                    <div className="relative w-20 h-20 mb-6">
                      <div className="absolute inset-0 border-4 border-muted rounded-full" />
                      <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin" />
                      <UploadCloud className="absolute inset-0 m-auto w-8 h-8 text-primary animate-pulse" />
                    </div>
                    <h4 className="text-xl font-bold text-foreground mb-2">Uploading Timetable...</h4>
                    <p className="text-muted-foreground text-sm">Processing CSV rows for {uploadLevel} level.</p>
                  </motion.div>
                )}

                {uploadSuccess && (
                  <motion.div
                    key="upload-success"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center h-72 text-center p-8"
                  >
                    <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mb-6 shadow-2xl shadow-green-500/20">
                      <Check className="w-12 h-12 text-green-500" />
                    </div>
                    <h4 className="text-2xl font-bold text-foreground mb-2">Upload Complete!</h4>
                    <p className="text-muted-foreground text-sm">Timetable imported successfully.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
