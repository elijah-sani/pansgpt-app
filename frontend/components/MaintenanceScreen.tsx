'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Construction } from 'lucide-react';

export default function MaintenanceScreen() {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4">
            <div className="max-w-md w-full text-center space-y-6 animate-in fade-in zoom-in duration-500">
                <div className="relative mx-auto w-24 h-24">
                    <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping duration-[3s]" />
                    <div className="relative bg-card rounded-full p-6 shadow-xl border border-border">
                        <Construction className="w-12 h-12 text-primary animate-pulse" />
                    </div>
                </div>

                <div className="space-y-4">
                    <h1 className="text-3xl font-bold text-foreground">
                        System Maintenance
                    </h1>
                    <p className="text-muted-foreground leading-relaxed">
                        We're currently upgrading the PansGPT system to serve you better.
                        Access is temporarily paused while we deploy enhancements.
                    </p>
                </div>

                <div className="bg-muted/50 rounded-xl p-4 border border-border">
                    <div className="flex items-center justify-center gap-2 text-sm text-foreground font-medium">
                        <div className="w-2 h-2 rounded-full bg-yellow-500 animate-bounce" />
                        Estimated Duration: &lt; 30 Mins
                    </div>
                </div>

                <div className="pt-4 text-xs text-muted-foreground">
                    Thank you for your patience.
                </div>
            </div>
        </div>
    );
}
