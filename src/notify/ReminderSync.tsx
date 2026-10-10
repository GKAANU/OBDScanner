import { useEffect, useMemo, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useGarage } from '../garage/store';
import { useDueDates, usePlan } from '../garage/usePlan';
import { usePro } from '../pro/entitlement';
import { daysBetween, todayISO } from '../utils/format';
import { DEFAULT_KM_PER_DAY, planReminders, type PlannedReminder, type ReminderDoc } from './reminders';
import { useReminderSettings } from './settings';

/**
 * The reminders that should be scheduled right now. Due-date reminders are
 * free; maintenance and seasonal reminders are Pro.
 */
export function usePlannedReminders(): PlannedReminder[] {
  const { vehicle, docs } = useGarage();
  const { rows } = usePlan();
  const due = useDueDates();
  const [settings] = useReminderSettings();
  const { isPro } = usePro();

  return useMemo(() => {
    if (!vehicle) return [];
    const today = todayISO();
    const kindById = new Map(docs.map((d) => [d.id, d.kind]));
    const reminderDocs: ReminderDoc[] = due.map((r) => ({
      id: r.id,
      name: r.name,
      date: r.date,
      kind: r.auto ? 'mtv' : kindById.get(r.id) ?? 'custom',
    }));
    // Rough average use since the model year; clamped to sane bounds.
    let kmPerDay = DEFAULT_KM_PER_DAY;
    if (vehicle.year && vehicle.km > 0) {
      const days = Math.max(180, daysBetween(`${vehicle.year}-01-01`, today));
      kmPerDay = Math.min(200, Math.max(10, vehicle.km / days));
    }
    return planReminders({
      today,
      now: new Date(),
      docs: reminderDocs,
      maintenance: rows.map((r) => ({
        id: r.item.id,
        name: r.item.name,
        status: r.status,
        intervalKm: r.item.intervalKm,
        intervalMonths: r.item.intervalMonths,
        vehicleKmPerDay: kmPerDay,
      })),
      vehicleName: vehicle.name || vehicle.model || 'Aracın',
      settings: { ...settings, maintenance: settings.maintenance && isPro, seasonal: settings.seasonal && isPro },
    });
  }, [vehicle, docs, rows, due, settings, isPro]);
}

/** Keeps scheduled local reminders in sync with garage data. Never asks for permission. */
export function ReminderSync(): null {
  const planned = usePlannedReminders();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    } catch {}
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void (async () => {
        try {
          const perm = await Notifications.getPermissionsAsync();
          if (!perm.granted) return;
          await Notifications.cancelAllScheduledNotificationsAsync();
          for (const r of planned) {
            await Notifications.scheduleNotificationAsync({
              identifier: r.id,
              content: { title: r.title, body: r.body, sound: true },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.date },
            });
          }
        } catch {
          // Scheduling is best effort.
        }
      })();
    }, 1000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [planned]);

  return null;
}
