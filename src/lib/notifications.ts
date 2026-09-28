import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { track } from './analytics';
import { openPaywall } from './paywall';

/**
 * Push notifications. The server sends them through Expo:
 *  • daily-motivation: one coach message a day at the user's
 *    notification_time; after 8 days without a check-in it becomes a nudge
 *  • promo-push: offers & news, only for people who opted in separately
 * The app asks for permission (after explaining why, see /push-intro) and
 * saves the device's Expo push token on the profile.
 *
 * Needs an Expo project ID (app.json → extra.eas.projectId), created with
 * `npx eas-cli@latest init`. See docs/SETUP-BACKEND.md.
 */

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export type PushResult = { ok: true; token: string } | { ok: false; reason: 'denied' | 'no_project' | 'unsupported' | 'error' };
export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export const projectId = (): string | undefined =>
  (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ?? Constants.easConfig?.projectId;

/** Whether we may still show the iPhone's permission prompt. */
export async function pushPermission(): Promise<PushPermission> {
  if (Platform.OS === 'web') return 'unsupported';
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    return current.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/** Asks for permission (once) and returns this device's Expo push token. */
export async function enablePush(): Promise<PushResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'unsupported' };
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Daily coach',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return { ok: false, reason: 'denied' };

    const id = projectId();
    if (!id) return { ok: false, reason: 'no_project' };
    const token = await Notifications.getExpoPushTokenAsync({ projectId: id });
    return { ok: true, token: token.data };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

const ROUTES = ['/today', '/check-in', '/coach', '/machine'] as const;
let lastHandled: string | null = null;

function openFrom(response: Notifications.NotificationResponse | null) {
  if (!response) return;
  const id = response.notification.request.identifier;
  if (id === lastHandled) return;
  lastHandled = id;
  Notifications.clearLastNotificationResponseAsync().catch(() => {});

  const data = (response.notification.request.content.data ?? {}) as { url?: unknown; kind?: unknown };
  const url = typeof data.url === 'string' ? data.url : null;
  track('notification_opened', { kind: typeof data.kind === 'string' ? data.kind : 'unknown', url });

  if (url === '/paywall') {
    openPaywall('promo');
    return;
  }
  const target = ROUTES.find((r) => r === url);
  if (target) router.push(target);
}

/** Tapping a push opens the right screen (Today, check-in, coach…) once the app is ready. */
export function useNotificationTaps(ready: boolean) {
  useEffect(() => {
    if (Platform.OS === 'web' || !ready) return;
    Notifications.getLastNotificationResponseAsync()
      .then(openFrom)
      .catch(() => {});
    const subscription = Notifications.addNotificationResponseReceivedListener(openFrom);
    return () => subscription.remove();
  }, [ready]);
}

/** "08:30:00" → "08:30" */
export const shortTime = (time: string | null | undefined) => (time ? time.slice(0, 5) : '09:00');

export const PUSH_TIMES = ['07:00', '08:00', '09:00', '12:00', '18:00', '20:00', '21:00'];
