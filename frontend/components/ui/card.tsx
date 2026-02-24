import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> { }
interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> { }

export function Card({ className = "", children, ...props }: CardProps) {
    return (
        <div
            className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm ${className}`}
            {...props}
        >
            {children}
        </div>
    );
}

export function CardContent({ className = "", children, ...props }: CardContentProps) {
    return (
        <div className={`p-6 ${className}`} {...props}>
            {children}
        </div>
    );
}
