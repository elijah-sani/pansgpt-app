"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

export function ThemeToggle() {
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return <div className="w-[51px] h-[31px] rounded-full bg-gray-200 dark:bg-secondary/50" /> // Placeholder to prevent hydration mismatch
    }

    const isDark = theme === "dark"

    return (
        <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={`
        relative flex h-[31px] w-[51px] cursor-pointer items-center rounded-full border-none p-0.5 transition-colors duration-200
        ${isDark ? 'bg-primary justify-end' : 'bg-gray-200 dark:bg-secondary justify-start'}
      `}
            aria-label="Toggle theme"
        >
            <div className="h-[27px] w-[27px] rounded-full bg-white shadow-sm transition-all flex items-center justify-center">
                {isDark ? (
                    <Moon className="h-4 w-4 text-primary" />
                ) : (
                    <Sun className="h-4 w-4 text-yellow-500" />
                )}
            </div>
        </button>
    )
}
