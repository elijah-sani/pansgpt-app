'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cpu, Globe, Wrench } from 'lucide-react';

import { api } from '@/lib/api';

type SystemConfig = {
    system_prompt: string;
    temperature: number;
    maintenance_mode: boolean;
    web_search_enabled: boolean;
    rag_threshold: number;
};

export default function SuperAdminAIConfigurationPage() {
    const [config, setConfig] = useState<SystemConfig>({
        system_prompt: '',
        temperature: 0.7,
        maintenance_mode: false,
        web_search_enabled: true,
        rag_threshold: 0.5,
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            try {
                const response = await api.get('/admin/config');
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload.detail || 'Unable to load AI configuration');
                setConfig({
                    system_prompt: payload.system_prompt ?? '',
                    temperature: Number(payload.temperature ?? 0.7),
                    maintenance_mode: Boolean(payload.maintenance_mode),
                    web_search_enabled: payload.web_search_enabled !== false,
                    rag_threshold: Number(payload.rag_threshold ?? 0.5),
                });
            } catch (err) {
                setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unable to load AI configuration' });
            } finally {
                setIsLoading(false);
            }
        };
        void load();
    }, []);

    const saveConfig = async (partial?: Partial<SystemConfig>) => {
        setIsSaving(true);
        setMessage(null);
        const nextConfig = { ...config, ...partial };
        try {
            const response = await api.post('/admin/config/update', partial || nextConfig);
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.detail || 'Unable to save AI configuration');
            setConfig(nextConfig);
            setMessage({ type: 'success', text: 'AI configuration saved.' });
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unable to save AI configuration' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-5xl space-y-8">
            <header>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-500">Global Controls</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">AI Configuration</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    These settings affect the platform globally. University admins do not see or edit these controls.
                </p>
            </header>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm md:p-6">
                <div className="mb-6 flex items-center gap-3 border-b border-border pb-5">
                    <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
                        <Cpu className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="font-semibold">Model Behavior</h2>
                        <p className="text-xs text-muted-foreground">Prompt, temperature, and retrieval matching.</p>
                    </div>
                </div>

                {isLoading ? (
                    <p className="py-16 text-center text-sm text-muted-foreground">Loading configuration...</p>
                ) : (
                    <div className="space-y-6">
                        <div>
                            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground">System Prompt</label>
                            <textarea
                                value={config.system_prompt}
                                onChange={(event) => setConfig((prev) => ({ ...prev, system_prompt: event.target.value }))}
                                className="h-56 w-full rounded-xl border border-border bg-background p-4 font-mono text-sm leading-relaxed outline-none focus:border-amber-500"
                            />
                            <div className="mt-2 text-right text-xs text-muted-foreground">{config.system_prompt.length} chars</div>
                        </div>

                        <Slider
                            label="Temperature"
                            value={config.temperature}
                            min={0}
                            max={1}
                            step={0.1}
                            onChange={(value) => setConfig((prev) => ({ ...prev, temperature: value }))}
                        />
                        <Slider
                            label="RAG Match Threshold"
                            value={config.rag_threshold}
                            min={0.1}
                            max={1}
                            step={0.05}
                            onChange={(value) => setConfig((prev) => ({ ...prev, rag_threshold: value }))}
                        />

                        <div className="grid gap-4 md:grid-cols-2">
                            <ToggleRow
                                icon={Wrench}
                                title="Maintenance Mode"
                                description="Disable normal user access temporarily."
                                checked={config.maintenance_mode}
                                onChange={(checked) => saveConfig({ maintenance_mode: checked })}
                            />
                            <ToggleRow
                                icon={Globe}
                                title="Web Search"
                                description="Allow the AI to use live web search where supported."
                                checked={config.web_search_enabled}
                                onChange={(checked) => saveConfig({ web_search_enabled: checked })}
                            />
                        </div>

                        <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                            {message ? (
                                <p className={`inline-flex items-center gap-2 text-sm font-medium ${message.type === 'success' ? 'text-emerald-500' : 'text-destructive'}`}>
                                    {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                                    {message.text}
                                </p>
                            ) : <span />}
                            <button
                                type="button"
                                onClick={() => saveConfig()}
                                disabled={isSaving}
                                className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isSaving ? 'Saving...' : 'Save Configuration'}
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
    return (
        <div>
            <div className="mb-3 flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</label>
                <span className="font-mono text-sm font-bold text-amber-500">{value.toFixed(step < 0.1 ? 2 : 1)}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                className="w-full accent-amber-500"
            />
        </div>
    );
}

function ToggleRow({ icon: Icon, title, description, checked, onChange }: { icon: React.ElementType; title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background p-4">
            <div className="flex items-center gap-3">
                <div className="rounded-lg bg-muted p-2 text-foreground">
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="text-xs text-muted-foreground">{description}</p>
                </div>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} />
                <div className="h-6 w-11 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-amber-500 peer-checked:after:translate-x-full" />
            </label>
        </div>
    );
}
