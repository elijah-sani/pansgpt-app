export default function AbstractCube() {
    return (
        <svg viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full opacity-80">
            {/* Main Outer Shape - Thick Green Line */}
            <path
                d="M100 150 L400 150 L400 450 M100 150 L100 450"
                stroke="#16a34a" // green-600
                strokeWidth="2"
                strokeLinecap="round"
                className="animate-pulse"
                style={{ filter: "drop-shadow(0 0 10px rgba(22, 163, 74, 0.5))" }}
            />
            {/* Inner Detail - Thin Green Lines asking for depth */}
            <path
                d="M150 200 L350 200 L350 400 M150 200 L150 400"
                stroke="#22c55e" // green-500
                strokeWidth="1"
                strokeOpacity="0.5"
            />

            {/* Curved abstract element bottom */}
            <path
                d="M200 450 Q250 350 300 450"
                stroke="#4ade80" // green-400
                strokeWidth="2"
            />

            {/* Diagonal depth lines */}
            <line x1="100" y1="150" x2="150" y2="200" stroke="#16a34a" />
            <line x1="400" y1="150" x2="350" y2="200" stroke="#16a34a" />

            {/* Gradient definition for advanced effects if needed */}
            <defs>
                <linearGradient id="paint0_linear" x1="250" y1="0" x2="250" y2="500" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#22c55e" stopOpacity="0" />
                    <stop offset="0.5" stopColor="#22c55e" />
                    <stop offset="1" stopColor="#22c55e" stopOpacity="0" />
                </linearGradient>
            </defs>
        </svg>
    )
}
