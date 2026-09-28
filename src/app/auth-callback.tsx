import { Redirect } from 'expo-router';

/**
 * Google / Apple send the browser back to chosen://auth-callback.
 * The sign-in itself is finished by src/lib/auth.ts; this screen only
 * forwards to the start, which routes the user onward.
 */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
