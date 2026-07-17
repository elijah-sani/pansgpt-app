"use client";
import React from "react";
import Image from "next/image"; // [IMG OPTIMIZATION]

export function Avatar({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={`relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full ${className}`} {...props}>
            {children}
        </div>
    );
}

export function AvatarImage({ src, alt, className = "", ...props }: Omit<React.ComponentProps<typeof Image>, 'src'> & { src?: string }) { // [IMG OPTIMIZATION]
    if (!src) return null;
    return <Image src={src} alt={alt || ""} fill className={`aspect-square h-full w-full object-cover ${className}`} {...props} />; // [IMG OPTIMIZATION]
}

export function AvatarFallback({ className = "", children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
    return (
        <span className={`flex h-full w-full items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-sm font-medium ${className}`} {...props}>
            {children}
        </span>
    );
}
