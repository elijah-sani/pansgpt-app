'use client';

import { FileStack } from 'lucide-react';

export default function LecturerMaterialsPage() {
  return (
    <div className="max-w-7xl mx-auto pb-12">
      <div className="md:grid md:grid-cols-12 md:gap-8">
        <div className="md:col-span-10 md:col-start-2 lg:col-span-10 lg:col-start-2">
          <div className="bg-card border border-border rounded-2xl p-8 min-h-[320px]">
            <div className="flex items-center gap-3 mb-4">
              <FileStack className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">Materials</h1>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Material upload and review workflows are not available yet. This section will host lecturer submissions in a future release.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
