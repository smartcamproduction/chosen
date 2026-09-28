import { useNetInfo } from '@react-native-community/netinfo';

/**
 * Online / offline. Unknown (the first moment after launch) counts as
 * online, so nothing flashes "offline" by mistake.
 */
export function useOnline(): boolean {
  const net = useNetInfo();
  return net.isConnected !== false && net.isInternetReachable !== false;
}
