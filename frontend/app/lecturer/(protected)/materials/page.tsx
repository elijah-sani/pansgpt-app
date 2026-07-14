'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, FileUp, Loader2, RefreshCcw, X } from 'lucide-react';

import { AuthMessage } from '@/components/auth/AuthMessage';
import { INPUT_CLASS_NAME, LEVELS, PRIMARY_BUTTON_CLASS_NAME } from '@/components/auth/authConstants';
import ErrorRecoveryView from '@/components/ErrorRecoveryView';
import LocalErrorBoundary from '@/components/LocalErrorBoundary';
import { api } from '@/lib/api';
import { toast } from 'sonner';

type MaterialStatus = 'pending_review' | 'approved' | 'rejected' | 'cancelled';

type MaterialSubmission = {
  id: string;
  title: string;
  course_code: string | null;
  course_title: string | null;
  level: string | null;
  file_name: string | null;
  file_url: string | null;
  file_type: string | null;
  mime_type: string | null;
  is_supported_file: boolean;
  status: MaterialStatus;
  review_note: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  pans_library_id: string | null;
  resubmitted_from_id: string | null;
  has_resubmission: boolean;
  latest_resubmission_id: string | null;
  library_embedding_status: 'pending' | 'processing' | 'completed' | 'failed' | string | null;
  library_embedding_progress: number | null;
  library_embedding_error: string | null;
  created_at: string | null;
};

type MaterialsResponse = {
  data: MaterialSubmission[];
};

type MaterialFormState = {
  level: string;
  course_code: string;
  topic: string;
  course_title: string;
};

const initialFormState: MaterialFormState = {
  level: '',
  course_code: '',
  topic: '',
  course_title: '',
};

const STATUS_LABELS: Record<MaterialStatus, string> = {
  pending_review: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const STATUS_CLASSES: Record<MaterialStatus, string> = {
  pending_review: 'border-amber-500/20 bg-amber-500/10 text-amber-600',
  approved: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600',
  rejected: 'border-rose-500/20 bg-rose-500/10 text-rose-600',
  cancelled: 'border-slate-500/20 bg-slate-500/10 text-slate-600',
};

async function readApiError(response: Response, fallback: string) {
  const rawText = await response.clone().text().catch(() => '');
  if (!rawText) {
    return fallback;
  }

  try {
    const payload = JSON.parse(rawText) as { detail?: unknown; message?: unknown; error?: unknown };
    const detail = payload.detail ?? payload.message ?? payload.error;
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }
    if (detail) {
      return JSON.stringify(detail);
    }
  } catch {
    return rawText;
  }

  return fallback;
}

export default function LecturerMaterialsPage() {
  const [materials, setMaterials] = useState<MaterialSubmission[]>([]);
  const [form, setForm] = useState<MaterialFormState>(initialFormState);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [resubmitTarget, setResubmitTarget] = useState<MaterialSubmission | null>(null);
  const [resubmitForm, setResubmitForm] = useState<MaterialFormState>(initialFormState);
  const [resubmitFile, setResubmitFile] = useState<File | null>(null);
  const [resubmitFileInputKey, setResubmitFileInputKey] = useState(0);
  const [resubmitError, setResubmitError] = useState<string | null>(null);
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchMaterials = useCallback(async (refreshing = false) => {
    if (refreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setLoadError(null);

    try {
      const response = await api.get('/lecturer/materials');
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Unable to load your submissions'));
      }

      const payload = (await response.json()) as MaterialsResponse;
      setMaterials(payload.data || []);
    } catch (error) {
      console.error('Failed to fetch lecturer materials:', error);
      setLoadError(error instanceof Error ? error.message : 'Unable to load your submissions');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchMaterials();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchMaterials]);

  const orderedMaterials = useMemo(
    () =>
      [...materials].sort((left, right) => {
        const leftTime = Date.parse(left.created_at || '') || 0;
        const rightTime = Date.parse(right.created_at || '') || 0;
        return rightTime - leftTime;
      }),
    [materials],
  );

  const updateFormField = <K extends keyof MaterialFormState>(field: K, value: MaterialFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] ?? null);
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setFileInputKey((key) => key + 1);
  };

  const openResubmitDialog = (material: MaterialSubmission) => {
    setResubmitTarget(material);
    setResubmitForm({
      level: material.level || '',
      course_code: material.course_code || '',
      topic: material.title || '',
      course_title: material.course_title || '',
    });
    setResubmitFile(null);
    setResubmitFileInputKey((key) => key + 1);
    setResubmitError(null);
  };

  const closeResubmitDialog = () => {
    if (isResubmitting) return;
    setResubmitTarget(null);
    setResubmitForm(initialFormState);
    setResubmitFile(null);
    setResubmitFileInputKey((key) => key + 1);
    setResubmitError(null);
  };

  const updateResubmitField = <K extends keyof MaterialFormState>(field: K, value: MaterialFormState[K]) => {
    setResubmitForm((current) => ({ ...current, [field]: value }));
  };

  const handleResubmitFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setResubmitFile(event.target.files?.[0] ?? null);
  };

  const clearResubmitFile = () => {
    setResubmitFile(null);
    setResubmitFileInputKey((key) => key + 1);
  };

  const submitMaterial = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const topic = form.topic.trim();
    if (!form.level.trim()) {
      setFormError('Level is required.');
      return;
    }
    if (!form.course_code.trim()) {
      setFormError('Course code is required.');
      return;
    }
    if (!topic) {
      setFormError('Topic is required.');
      return;
    }
    if (!selectedFile) {
      setFormError('Choose one file to upload.');
      return;
    }

    const data = new FormData();
    data.append('level', form.level.trim());
    data.append('course_code', form.course_code.trim());
    data.append('topic', topic);
    if (form.course_title.trim()) data.append('course_title', form.course_title.trim());
    data.append('file', selectedFile);

    setIsSubmitting(true);
    try {
      const response = await api.post('/lecturer/materials', data);
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Unable to submit material'));
      }

      setForm(initialFormState);
      setSelectedFile(null);
      setFileInputKey((key) => key + 1);
      showMaterialSubmittedToast();
      await fetchMaterials(true);
    } catch (error) {
      console.error('Failed to submit lecturer material:', error);
      setFormError(error instanceof Error ? error.message : 'Unable to submit material');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelSubmission = async (material: MaterialSubmission) => {
    if (material.status !== 'pending_review') return;

    const confirmed = window.confirm('Cancel this pending submission? The uploaded file will be removed where it is not used anywhere else.');
    if (!confirmed) return;

    setCancellingIds((current) => new Set(current).add(material.id));
    try {
      const response = await api.post(`/lecturer/materials/${material.id}/cancel`, { reason: null });
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Unable to cancel submission'));
      }

      const payload = (await response.json()) as { cleanup_warnings?: string[] };
      const warnings = payload.cleanup_warnings || [];
      if (warnings.length > 0) {
        toast.warning('Submission cancelled. Some Drive cleanup needs manual review.');
      } else {
        toast.success('Submission cancelled.');
      }
      await fetchMaterials(true);
    } catch (error) {
      console.error('Failed to cancel lecturer material:', error);
      toast.error(error instanceof Error ? error.message : 'Unable to cancel submission');
    } finally {
      setCancellingIds((current) => {
        const next = new Set(current);
        next.delete(material.id);
        return next;
      });
    }
  };

  const submitResubmission = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resubmitTarget) return;

    setResubmitError(null);
    const topic = resubmitForm.topic.trim();
    if (!resubmitForm.level.trim()) {
      setResubmitError('Level is required.');
      return;
    }
    if (!resubmitForm.course_code.trim()) {
      setResubmitError('Course code is required.');
      return;
    }
    if (!topic) {
      setResubmitError('Topic is required.');
      return;
    }
    if (!resubmitFile) {
      setResubmitError('Choose the corrected file to upload.');
      return;
    }

    const confirmed = window.confirm('Submit this corrected material as a new resubmission? The rejected record will remain unchanged.');
    if (!confirmed) return;

    const data = new FormData();
    data.append('level', resubmitForm.level.trim());
    data.append('course_code', resubmitForm.course_code.trim());
    data.append('topic', topic);
    if (resubmitForm.course_title.trim()) data.append('course_title', resubmitForm.course_title.trim());
    data.append('file', resubmitFile);

    setIsResubmitting(true);
    try {
      const response = await api.post(`/lecturer/materials/${resubmitTarget.id}/resubmit`, data);
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Unable to resubmit material'));
      }

      closeResubmitDialog();
      toast.success('Corrected material submitted for review.');
      await fetchMaterials(true);
    } catch (error) {
      console.error('Failed to resubmit lecturer material:', error);
      setResubmitError(error instanceof Error ? error.message : 'Unable to resubmit material');
    } finally {
      setIsResubmitting(false);
    }
  };

  const fileLabelClass = selectedFile
    ? 'flex min-h-14 flex-1 cursor-pointer items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 transition-colors hover:bg-muted/40'
    : 'flex min-h-14 flex-1 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-background/70 px-4 py-3 transition-colors hover:bg-muted/40';

  const submitButtonClass = PRIMARY_BUTTON_CLASS_NAME.replace("w-full ", "") + " w-full lg:mt-6 lg:min-h-14 lg:w-auto";

  const refreshIconClass = isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4';

  return (
    <div className="mx-auto w-full max-w-5xl pb-0 md:px-0 md:pb-12">
      <div className="flex flex-col gap-6 px-4 sm:px-5 md:px-0">
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Course content</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Materials</h1>
            <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
              Submit course materials students can study from.
            </p>
          </header>

          <LocalErrorBoundary
            boundaryName="lecturer-materials-form"
            fallback={({ error, retry }) => (
              <ErrorRecoveryView
                title="Material form unavailable"
                description="The lecturer materials submission form hit an unexpected problem. Retry the form without losing the rest of the page."
                sectionLabel="Lecturer"
                errorMessage={error.message}
                retryLabel="Retry Form"
                onRetry={retry}
                secondaryLabel="Go Home"
                onSecondaryAction={() => window.location.assign('/lecturer')}
              />
            )}
          >
            <section>
              <form onSubmit={submitMaterial} className="space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Level" required>
                    <select
                      autoFocus
                      value={form.level}
                      onChange={(event) => updateFormField('level', event.target.value)}
                      className={`${INPUT_CLASS_NAME} appearance-none`}
                    >
                      <option value="">Select level</option>
                      {LEVELS.map((level) => (
                        <option key={level} value={`${level}L`}>
                          {level}L
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Course code" required>
                    <input
                      value={form.course_code}
                      onChange={(event) => updateFormField('course_code', event.target.value)}
                      className={INPUT_CLASS_NAME}
                      placeholder="e.g. PCL 422"
                    />
                  </Field>

                  <Field label="Topic" required>
                    <input
                      value={form.topic}
                      onChange={(event) => updateFormField('topic', event.target.value)}
                      className={INPUT_CLASS_NAME}
                      placeholder="e.g. Cardiovascular Pharmacology"
                    />
                  </Field>

                  <Field label="Course title">
                    <input
                      value={form.course_title}
                      onChange={(event) => updateFormField('course_title', event.target.value)}
                      className={INPUT_CLASS_NAME}
                      placeholder="e.g. Clinical Pharmacy"
                    />
                  </Field>

                </div>

                {formError ? <AuthMessage message={{ type: 'error', text: formError }} /> : null}

                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="w-full space-y-1.5 lg:max-w-2xl">
                    <span className="text-sm font-bold text-foreground">
                      File upload <span className="ml-1 text-rose-600">*</span>
                    </span>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <label className={fileLabelClass}>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                          {selectedFile ? (
                            <FileText className="h-4 w-4 text-primary" />
                          ) : (
                            <FileUp className="h-4 w-4 text-primary" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-sm font-semibold text-foreground">
                            {selectedFile ? selectedFile.name : 'Choose material file'}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {selectedFile ? `${formatSelectedFileMeta(selectedFile)}. Click to change.` : 'One file only'}
                          </span>
                        </span>
                        <input key={fileInputKey} type="file" className="sr-only" onChange={handleFileChange} />
                      </label>
                      {selectedFile ? (
                        <button
                          type="button"
                          onClick={clearSelectedFile}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-14"
                        >
                          <X className="h-4 w-4" />
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={submitButtonClass}
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit material'}
                  </button>
                </div>
              </form>
            </section>
          </LocalErrorBoundary>

          <LocalErrorBoundary
            boundaryName="lecturer-materials-list"
            fallback={({ error, retry }) => (
              <ErrorRecoveryView
                title="Materials list unavailable"
                description="The submission tracking panel hit an unexpected problem. Retry just this panel and keep the rest of the page available."
                sectionLabel="Lecturer"
                errorMessage={error.message}
                retryLabel="Retry List"
                onRetry={retry}
                secondaryLabel="Refresh Data"
                onSecondaryAction={() => void fetchMaterials(true)}
              />
            )}
          >
            <section className="border-t border-border pt-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Your submissions</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Track each material you have sent.</p>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchMaterials(true)}
                  disabled={isRefreshing}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  <RefreshCcw className={refreshIconClass} />
                  Refresh
                </button>
              </div>

              {loadError ? (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5">
                  <h3 className="text-sm font-semibold text-rose-700">Unable to load materials.</h3>
                  <p className="mt-2 text-sm text-rose-700/90">{loadError}</p>
                </div>
              ) : isLoading ? (
                <div className="flex min-h-[140px] items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span>Loading submissions...</span>
                </div>
              ) : orderedMaterials.length === 0 ? (
                <div className="rounded-2xl border border-border bg-background/70 p-6">
                  <h3 className="text-sm font-semibold text-foreground">No materials submitted yet</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Submit your first material with the form above. It will appear here after it is sent for admin review.
                  </p>
                </div>
              ) : (
                <MaterialList
                  materials={orderedMaterials}
                  cancellingIds={cancellingIds}
                  onCancel={cancelSubmission}
                  onResubmit={openResubmitDialog}
                />
              )}
            </section>
          </LocalErrorBoundary>
        </div>
      {resubmitTarget ? (
        <ResubmitDialog
          material={resubmitTarget}
          form={resubmitForm}
          selectedFile={resubmitFile}
          fileInputKey={resubmitFileInputKey}
          error={resubmitError}
          isSubmitting={isResubmitting}
          onClose={closeResubmitDialog}
          onFieldChange={updateResubmitField}
          onFileChange={handleResubmitFileChange}
          onClearFile={clearResubmitFile}
          onSubmit={submitResubmission}
        />
      ) : null}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-sm font-bold text-foreground">
        {label}
        {required ? <span className="ml-1 text-rose-600">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function MaterialList({
  materials,
  cancellingIds,
  onCancel,
  onResubmit,
}: {
  materials: MaterialSubmission[];
  cancellingIds: Set<string>;
  onCancel: (material: MaterialSubmission) => void;
  onResubmit: (material: MaterialSubmission) => void;
}) {
  const materialsById = useMemo(
    () => Object.fromEntries(materials.map((material) => [material.id, material])),
    [materials],
  );

  return (
    <div className="space-y-3">
      {materials.map((material) => {
        const course = [material.course_code, material.course_title].filter(Boolean).join(' - ') || 'Course not set';
        const previousSubmission = material.resubmitted_from_id ? materialsById[material.resubmitted_from_id] : null;
        const nextSubmission = material.latest_resubmission_id ? materialsById[material.latest_resubmission_id] : null;

        return (
          <article key={material.id} className="rounded-2xl border border-border bg-background/80 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-foreground">{material.title}</h3>
                  <StatusBadge status={material.status} />
                  {material.resubmitted_from_id ? <ChainBadge tone="blue" label="Resubmission" /> : null}
                  {material.has_resubmission ? <ChainBadge tone="slate" label="Resubmitted" /> : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{course}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  <span>Level: {material.level || 'Not set'}</span>
                  <span>Submitted: {formatDateTime(material.created_at)}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-muted-foreground">Review:</span>
                  <StatusBadge status={material.status} />
                  {material.pans_library_id ? (
                    <>
                      <span className="ml-2 font-semibold text-muted-foreground">Processing:</span>
                      <ProcessingBadge status={material.library_embedding_status} progress={material.library_embedding_progress} />
                    </>
                  ) : null}
                </div>
                {material.library_embedding_error ? (
                  <p className="mt-3 rounded-xl border border-orange-500/20 bg-orange-500/10 px-3 py-2 text-sm text-orange-700">
                    Processing error: {material.library_embedding_error}
                  </p>
                ) : null}
                {material.review_note && material.status === 'rejected' ? (
                  <p className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700">
                    Note: {material.review_note}
                  </p>
                ) : null}
                {material.resubmitted_from_id ? (
                  <p className="mt-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-sm text-blue-700">
                    Resubmission of {previousSubmission?.title || 'previous rejected submission'} ({shortSubmissionId(material.resubmitted_from_id)}).
                  </p>
                ) : null}
                {material.has_resubmission && material.latest_resubmission_id ? (
                  <p className="mt-3 rounded-xl border border-slate-500/20 bg-slate-500/10 px-3 py-2 text-sm text-slate-700">
                    Resubmitted as {nextSubmission?.title || 'newer submission'} ({shortSubmissionId(material.latest_resubmission_id)}).
                  </p>
                ) : null}
                {material.status === 'cancelled' ? (
                  <p className="mt-3 rounded-xl border border-slate-500/20 bg-slate-500/10 px-3 py-2 text-sm text-slate-700">
                    Cancelled{material.cancelled_at ? ` on ${formatDateTime(material.cancelled_at)}` : ''}
                    {material.cancellation_reason ? `: ${material.cancellation_reason}` : ''}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col">
                {material.file_url ? (
                  <a
                    href={material.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open file
                  </a>
                ) : null}
                {material.status === 'pending_review' ? (
                  <button
                    type="button"
                    onClick={() => onCancel(material)}
                    disabled={cancellingIds.has(material.id)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 px-3 py-2 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-500/10 disabled:opacity-60"
                  >
                    {cancellingIds.has(material.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                    Cancel Submission
                  </button>
                ) : null}
                {material.status === 'rejected' && !material.has_resubmission ? (
                  <button
                    type="button"
                    onClick={() => onResubmit(material)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500/30 px-3 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-500/10"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Resubmit Material
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: MaterialStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_CLASSES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function ChainBadge({ label, tone }: { label: string; tone: 'blue' | 'slate' }) {
  const toneClass = tone === 'blue'
    ? 'border-blue-500/20 bg-blue-500/10 text-blue-700'
    : 'border-slate-500/20 bg-slate-500/10 text-slate-700';

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>{label}</span>;
}

function ResubmitDialog({
  material,
  form,
  selectedFile,
  fileInputKey,
  error,
  isSubmitting,
  onClose,
  onFieldChange,
  onFileChange,
  onClearFile,
  onSubmit,
}: {
  material: MaterialSubmission;
  form: MaterialFormState;
  selectedFile: File | null;
  fileInputKey: number;
  error: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onFieldChange: <K extends keyof MaterialFormState>(field: K, value: MaterialFormState[K]) => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClearFile: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const fileLabelClass = selectedFile
    ? 'flex min-h-14 flex-1 cursor-pointer items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 px-4 py-3 transition-colors hover:bg-muted/40'
    : 'flex min-h-14 flex-1 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-background/70 px-4 py-3 transition-colors hover:bg-muted/40';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Resubmit material</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a corrected file as a new pending submission. The rejected record will remain unchanged.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {material.review_note ? (
          <div className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-700">
            <div className="font-semibold text-rose-800">Rejection note</div>
            <p className="mt-1">{material.review_note}</p>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-5 space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Level" required>
              <select
                value={form.level}
                onChange={(event) => onFieldChange('level', event.target.value)}
                className={`${INPUT_CLASS_NAME} appearance-none`}
              >
                <option value="">Select level</option>
                {LEVELS.map((level) => (
                  <option key={level} value={`${level}L`}>
                    {level}L
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Course code" required>
              <input
                value={form.course_code}
                onChange={(event) => onFieldChange('course_code', event.target.value)}
                className={INPUT_CLASS_NAME}
                placeholder="e.g. PCL 422"
              />
            </Field>

            <Field label="Topic" required>
              <input
                value={form.topic}
                onChange={(event) => onFieldChange('topic', event.target.value)}
                className={INPUT_CLASS_NAME}
                placeholder="e.g. Cardiovascular Pharmacology"
              />
            </Field>

            <Field label="Course title">
              <input
                value={form.course_title}
                onChange={(event) => onFieldChange('course_title', event.target.value)}
                className={INPUT_CLASS_NAME}
                placeholder="e.g. Clinical Pharmacy"
              />
            </Field>
          </div>

          {error ? <AuthMessage message={{ type: 'error', text: error }} /> : null}

          <div className="space-y-1.5">
            <span className="text-sm font-bold text-foreground">
              Corrected file <span className="ml-1 text-rose-600">*</span>
            </span>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className={fileLabelClass}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                  {selectedFile ? <FileText className="h-4 w-4 text-primary" /> : <FileUp className="h-4 w-4 text-primary" />}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {selectedFile ? selectedFile.name : 'Choose corrected file'}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {selectedFile ? `${formatSelectedFileMeta(selectedFile)}. Click to change.` : 'One corrected file only'}
                  </span>
                </span>
                <input key={fileInputKey} type="file" className="sr-only" onChange={onFileChange} />
              </label>
              {selectedFile ? (
                <button
                  type="button"
                  onClick={onClearFile}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-14"
                >
                  <X className="h-4 w-4" />
                  Remove
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Submit Resubmission
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProcessingBadge({
  status,
  progress,
}: {
  status: MaterialSubmission['library_embedding_status'];
  progress: number | null;
}) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed') {
    return <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600">Completed</span>;
  }
  if (normalized === 'failed') {
    return <span className="inline-flex rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-600">Failed</span>;
  }
  if (normalized === 'processing') {
    const pct = typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : 0;
    return <span className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-600">Processing {pct}%</span>;
  }
  if (normalized === 'pending') {
    return <span className="inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600">Pending</span>;
  }
  return <span className="inline-flex rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground">Not started</span>;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 'File size unavailable';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return (size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)) + ' ' + units[unitIndex];
}

function detectSelectedFileType(file: File) {
  const ext = file.name.includes('.') ? file.name.split('.').pop()?.trim().toLowerCase() || null : null;
  if (ext) return ext;
  if (file.type === 'application/pdf') return 'pdf';
  return null;
}

function formatSelectedFileMeta(file: File) {
  const fileType = detectSelectedFileType(file);
  return [fileType ? fileType.toUpperCase() : null, formatFileSize(file.size)].filter(Boolean).join(' \u2022 ');
}

function shortSubmissionId(value: string) {
  return value.slice(0, 8);
}

function showMaterialSubmittedToast() {
  const durationMs = 3500;

  toast.custom(
    () => (
      <div className="w-[320px] overflow-hidden rounded-xl border border-emerald-500/20 bg-background shadow-xl">
        <div className="px-4 py-3">
          <div className="text-sm font-semibold text-foreground">Material submitted successfully.</div>
          <div className="mt-1 text-xs text-muted-foreground">Your file is now waiting for admin review.</div>
        </div>
        <div className="h-1 w-full bg-emerald-500/10">
          <div
            className="h-full bg-emerald-500"
            style={{
              width: '100%',
              transformOrigin: 'left center',
              animation: `material-toast-progress ${durationMs}ms linear forwards`,
            }}
          />
        </div>
      </div>
    ),
    {
      duration: durationMs,
    },
  );
}
