import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * Web preview only: React Native's Alert does nothing in a browser, so
 * confirmations (Fast Pivot, delete, purchases…) would silently fail.
 * Use the browser's own alert / confirm dialogs instead. The phone apps
 * keep the native alerts.
 */
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const all = buttons ?? [];
    const cancel = all.find((b) => b.style === 'cancel');
    const actions = all.filter((b) => b.style !== 'cancel');
    if (actions.length === 0) {
      window.alert(text);
      cancel?.onPress?.();
      return;
    }
    if (actions.length === 1 && !cancel) {
      window.alert(text);
      actions[0].onPress?.();
      return;
    }
    // Ask about each choice in turn (e.g. "Use Fast Pivot?" → OK / Cancel).
    for (const action of actions) {
      if (window.confirm(actions.length > 1 ? `${text}\n\n→ ${action.text}` : text)) {
        action.onPress?.();
        return;
      }
    }
    cancel?.onPress?.();
  };
}
