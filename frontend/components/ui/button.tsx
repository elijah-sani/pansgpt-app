import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    size?: "sm" | "default" | "lg" | "icon";
    variant?: "default" | "outline" | "ghost";
    asChild?: boolean;
}

export function Button({
    className = "",
    size = "default",
    variant = "default",
    children,
    ...props
}: ButtonProps) {
    const sizeClasses: Record<string, string> = {
        sm: "px-3 py-1.5 text-sm",
        default: "px-4 py-2 text-sm",
        lg: "px-6 py-3 text-base",
        icon: "p-2 h-9 w-9",
    };

    const variantClasses = {
        default:
            "bg-primary hover:bg-primary/90 text-primary-foreground",
        outline:
            "border border-border bg-transparent hover:bg-accent text-foreground",
        ghost:
            "bg-transparent hover:bg-accent text-foreground",
    };

    return (
        <button
            className={`inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 disabled:pointer-events-none ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}
