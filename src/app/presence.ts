import { PRESENCE_PING_MS, pingPresence } from '../net/lobby';
import { getAccount } from './account';

/** While the page is open and visible, a signed-in player tells the server every 45 s that they are online (the chat and the Course tab show the count). */
export function startPresence(): () => void {
  const ping = (): void => {
    if (document.hidden || !getAccount()?.pseudo) return;
    void pingPresence();
  };
  ping();
  const timer = setInterval(ping, PRESENCE_PING_MS);
  document.addEventListener('visibilitychange', ping);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', ping);
  };
}
