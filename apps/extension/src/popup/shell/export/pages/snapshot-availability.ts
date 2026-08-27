import { useEffect, useState } from 'react';
import { loadSettings } from '../../../../composition/persistence/settings';

type WebSnapshotAvailability = {
  enabled: boolean;
  status: 'error' | 'loaded' | 'loading';
};

export function useWebSnapshotAvailability(): WebSnapshotAvailability {
  const [availability, setAvailability] = useState<WebSnapshotAvailability>({
    enabled: false,
    status: 'loading',
  });

  useEffect(() => {
    let mounted = true;
    void loadSettings()
      .then((settings) => {
        if (mounted) {
          setAvailability({ enabled: settings.webSnapshotEnabled, status: 'loaded' });
        }
      })
      .catch(() => {
        if (mounted) setAvailability({ enabled: false, status: 'error' });
      });
    return () => {
      mounted = false;
    };
  }, []);

  return availability;
}
