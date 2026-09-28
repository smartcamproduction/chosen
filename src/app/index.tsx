import { Redirect } from 'expo-router';

import { useAccount } from '@/state/AccountProvider';
import { useApp } from '@/state/AppState';
import { nextRoute } from '@/state/hooks';

/** Entry point: sends each user to the right place for their account state. */
export default function Index() {
  const account = useAccount();
  const { state } = useApp();
  return <Redirect href={nextRoute(account, state)} />;
}
