import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export function useSystemStatus() {
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkSystem = async () => {
            try {
                const res = await fetch(`${API_URL}/sys/status`);
                if (res.ok) {
                    const data = await res.json();
                    setMaintenanceMode(data.maintenance_mode);
                }
            } catch (e) {
                console.error("Status Check Failed", e);
            } finally {
                setLoading(false);
            }
        };
        checkSystem();
    }, []);

    return { maintenanceMode, loading };
}
