// [ELECTRON PHASE 3] Groundwork hook for detecting Electron runtime platform
import { useState, useEffect } from "react";

export function useIsElectron(): boolean {
  const [isElectron, setIsElectron] = useState<boolean>(() => {
    return typeof window !== "undefined" && Boolean((window as any).electronAPI);
  });

  useEffect(() => {
    if (typeof window !== "undefined" && Boolean((window as any).electronAPI)) {
      setIsElectron(true);
    }
  }, []);

  return isElectron;
}
