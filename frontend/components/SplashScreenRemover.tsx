'use client';

import { useEffect } from 'react';

export default function SplashScreenRemover() {
    useEffect(() => {
        // This effect ONLY runs after React has successfully hydrated the entire layout,
        // meaning all CSS gradients, themes, and shell components are safely mounted.
        const splash = document.getElementById('pwa-splash');
        if (splash) {
            // Trigger the CSS opacity transition
            splash.style.opacity = '0';
            
            // Wait for the transition to finish (.5s) before removing from DOM
            setTimeout(() => {
                splash.remove();
            }, 500);
        }
    }, []);

    return null;
}
