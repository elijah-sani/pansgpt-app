"use client";
import React from "react";

export function Avatar({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={`relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full ${className}`} {...props}>
            {children}
        </div>
    );
}

export function AvatarImage({ src, alt, className = "", ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
    if (!src) return null;
    return <img src={src} alt={alt || ""} className={`aspect-square h-full w-full object-cover ${className}`} {...props} />;
}

export function AvatarFallback({ className = "", children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
    return (
        <span className={`flex h-full w-full items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-sm font-medium ${className}`} {...props}>
            {children}
        </span>
    );
}
