'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { BookOpenText, Pencil, Plus, Trash2, X, Loader2 } from 'lucide-react';

type FacultyKnowledgeItem = {
  id: string;
  level: string;
  knowledge_text: string;
  created_at?: string;
  updated_at?: string;
};

const FACULTY_ENDPOINT = '/admin/faculty-knowledge';

export default function FacultyKnowledgeManager() {
  const [knowledgeItems, setKnowledgeItems] = useState<FacultyKnowledgeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FacultyKnowledgeItem | null>(null);
  const [level, setLevel] = useState('');
  const [knowledgeText, setKnowledgeText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const modalTitle = useMemo(() => (editingItem ? 'Edit Level Knowledge' : 'Add New Level'), [editingItem]);

  const resetForm = useCallback(() => {
    setLevel('');
    setKnowledgeText('');
    setEditingItem(null);
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get(FACULTY_ENDPOINT);
      if (!res.ok) {
        throw new Error(`Failed to fetch faculty knowledge (${res.status})`);
      }
      const payload = await res.json();
      const rows = (payload?.data ?? []) as FacultyKnowledgeItem[];
      setKnowledgeItems(rows);
    } catch (err) {
      console.error(err);
      toast.error('Could not load faculty knowledge.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (item: FacultyKnowledgeItem) => {
    setEditingItem(item);
    setLevel(item.level ?? '');
    setKnowledgeText(item.knowledge_text ?? '');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
    resetForm();
  };

  const handleSave = async () => {
    const trimmedLevel = level.trim();
    const trimmedText = knowledgeText.trim();

    if (!trimmedLevel) {
      toast.error('Level is required.');
      return;
    }
    if (!trimmedText) {
      toast.error('Knowledge text is required.');
      return;
    }

    setIsSaving(true);
    try {
      const endpoint = editingItem
        ? `${FACULTY_ENDPOINT}/${editingItem.id}`
        : FACULTY_ENDPOINT;
      const method = editingItem ? 'PUT' : 'POST';
      const payload = { level: trimmedLevel, knowledge_text: trimmedText };

      const res = await api.fetch(endpoint, {
        method,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const raw = await res.text();
        throw new Error(raw || `Request failed (${res.status})`);
      }

      toast.success(editingItem ? 'Knowledge updated successfully.' : 'Knowledge created successfully.');
      closeModal();
      await fetchData();
    } catch (err) {
      console.error(err);
      toast.error(editingItem ? 'Failed to update knowledge.' : 'Failed to create knowledge.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await api.delete(`${FACULTY_ENDPOINT}/${id}`);
      if (!res.ok) {
        const raw = await res.text();
        throw new Error(raw || `Delete failed (${res.status})`);
      }
      toast.success('Knowledge deleted.');
      await fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete knowledge.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Faculty Knowledge Base</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage level-specific curriculum and lecturer context used in chat responses.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add New Level
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/35 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-6 py-4 font-semibold">Level</th>
                <th className="px-6 py-4 font-semibold">Knowledge Preview</th>
                <th className="px-6 py-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={`skeleton-${idx}`} className="animate-pulse">
                    <td className="px-6 py-5">
                      <div className="h-6 w-20 rounded-full bg-muted" />
                    </td>
                    <td className="px-6 py-5">
                      <div className="h-4 w-11/12 rounded bg-muted" />
                      <div className="mt-2 h-4 w-9/12 rounded bg-muted" />
                    </td>
                    <td className="px-6 py-5">
                      <div className="ml-auto h-9 w-28 rounded-lg bg-muted" />
                    </td>
                  </tr>
                ))
              ) : knowledgeItems.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-16 text-center">
                    <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30">
                        <BookOpenText className="h-7 w-7 text-muted-foreground/70" />
                      </div>
                      <p className="text-base font-semibold text-foreground">No faculty knowledge yet</p>
                      <p className="text-sm text-muted-foreground">
                        Add entries for levels like 100L, 400L, and General to enrich chat accuracy.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                knowledgeItems.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-6 py-5 align-top">
                      <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        {item.level}
                      </span>
                    </td>
                    <td className="px-6 py-5 align-top">
                      <p className="line-clamp-2 leading-relaxed text-foreground/90">{item.knowledge_text}</p>
                    </td>
                    <td className="px-6 py-5 align-top">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(item.id)}
                          disabled={deletingId === item.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingId === item.id ? (
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

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl border border-border/60 bg-card shadow-2xl">
            <div className="flex items-start justify-between border-b border-border/60 px-6 py-5">
              <div>
                <h3 className="text-lg font-semibold text-card-foreground">{modalTitle}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Keep this detailed and structured for better course and lecturer accuracy.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={isSaving}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Level</label>
                <input
                  type="text"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  placeholder="e.g., 100L, 400L, General"
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Knowledge Text</label>
                <textarea
                  value={knowledgeText}
                  onChange={(e) => setKnowledgeText(e.target.value)}
                  rows={10}
                  placeholder="Paste the faculty curriculum details, course list, lecturers, and schedule notes..."
                  className="w-full resize-y rounded-xl border border-input bg-background px-4 py-3 font-mono text-sm leading-relaxed text-foreground outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border/60 px-6 py-5">
              <button
                type="button"
                onClick={closeModal}
                disabled={isSaving}
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingItem ? 'Save Changes' : 'Create Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
