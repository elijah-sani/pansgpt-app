import React from "react";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: "default" | "secondary" | "outline";
}

export function Badge({ className = "", variant = "default", children, ...props }: BadgeProps) {
    const variantClasses = {
        default: "bg-green-600 text-white",
        secondary: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
        outline: "border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300",
    };

    return (
        <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${variantClasses[variant]} ${className}`}
            {...props}
        >
            {children}
        </span>
    );
}
