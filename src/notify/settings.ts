import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_REMINDER_SETTINGS, type ReminderSettings } from './reminders';

export type { ReminderSettings };

const KEY = 'otova.reminders.v1';

/** One shared copy so the settings screen and ReminderSync stay in step. */
let current: ReminderSettings = DEFAULT_REMINDER_SETTINGS;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function load(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) current = { ...DEFAULT_REMINDER_SETTINGS, ...(JSON.parse(raw) as Partial<ReminderSettings>) };
      } catch {
        // keep defaults
      }
      loaded = true;
      emit();
    })();
  }
  return loading;
}

export function saveReminderSettings(patch: Partial<ReminderSettings>) {
  current = { ...current, ...patch };
  AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => {});
  emit();
}

/** [settings, update, loaded] */
export function useReminderSettings(): [ReminderSettings, (patch: Partial<ReminderSettings>) => void, boolean] {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    void load();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return [current, saveReminderSettings, loaded];
}
