import React from "react";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: "default" | "secondary" | "outline";
}

export function Badge({ className = "", variant = "default", children, ...props }: BadgeProps) {
    const variantClasses = {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border border-border text-muted-foreground",
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
