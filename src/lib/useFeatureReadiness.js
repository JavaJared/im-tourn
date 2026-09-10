import { useEffect, useState } from 'react';
import { callServer } from '../services/server';
import { FEATURES } from '../config/app';

export function useFeatureReadiness() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    callServer('featureReadiness', {}).then(result => {
      if (active) FEATURES.drafts = false;
    }).catch(() => { if (active) FEATURES.drafts = false; }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  return ready;
}
