"use client";

import React, { useState } from 'react';
import { Bot, Maximize2, X } from 'lucide-react';

interface SlideCardProps {
    url: string;
    caption: string;
    context: string;
}

export default function SlideCard({ url, caption, context }: SlideCardProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <>
            {/* THUMBNAIL CARD */}
            <div
                onClick={() => setIsModalOpen(true)}
                className="group relative my-8 cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:ring-2 hover:ring-indigo-500 hover:ring-offset-2"
            >
                <div className="bg-gray-50 p-6">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={url}
                        alt={caption}
                        className="mx-auto max-h-[300px] w-auto rounded-lg object-contain shadow-sm transition-transform duration-300 group-hover:scale-105"
                    />

                    {/* Floating Label */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-4 py-1.5 text-xs font-semibold text-gray-700 shadow-sm backdrop-blur-sm group-hover:text-indigo-600">
                        Top to View Details
                    </div>

                    <div className="absolute right-4 top-4 rounded-full bg-white/80 p-1.5 backdrop-blur-sm transition-opacity opacity-0 group-hover:opacity-100">
                        <Maximize2 className="h-4 w-4 text-indigo-600" />
                    </div>
                </div>
            </div>

            {/* FULL SCREEN MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
                        onClick={() => setIsModalOpen(false)}
                    />

                    {/* Modal Content */}
                    <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200 sm:flex-row">

                        {/* Close Button */}
                        <button
                            onClick={() => setIsModalOpen(false)}
                            className="absolute right-4 top-4 z-10 rounded-full bg-black/10 p-2 text-gray-700 hover:bg-black/20 hover:text-black transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        {/* Left: Image Area */}
                        <div className="flex flex-1 items-center justify-center bg-gray-100 p-6">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={url}
                                alt={caption}
                                className="max-h-[40vh] w-auto rounded-lg object-contain shadow-md sm:max-h-[80vh]"
                            />
                        </div>

                        {/* Right: Details Area */}
                        <div className="flex w-full flex-col overflow-y-auto bg-white p-6 sm:w-[350px] sm:min-w-[350px] sm:border-l sm:border-gray-100">
                            <h3 className="mb-4 text-xl font-bold text-gray-900 border-b border-gray-100 pb-4">
                                {caption}
                            </h3>

                            <div className="flex items-center gap-2 mb-3 text-indigo-700">
                                <Bot className="h-5 w-5" />
                                <span className="font-bold text-sm">AI Analysis</span>
                            </div>

                            <div className="prose prose-sm prose-slate text-gray-700">
                                <p>{context}</p>
                            </div>

                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="mt-auto hidden w-full rounded-lg border border-gray-200 bg-gray-50 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-100 sm:block"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
