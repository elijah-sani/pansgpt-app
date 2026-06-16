import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export function useSystemStatus() {
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkSystem = async () => {
            try {
                const res = await api.get('/sys/status');
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
