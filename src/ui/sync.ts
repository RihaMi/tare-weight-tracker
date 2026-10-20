import { app } from '../app';
import { loadData } from '../data/storage';
import { migrate } from '../data/schema';
import { isEnvelope, unseal, type Envelope } from '../lib/crypto';
import { isLocked } from './lock';

// Keeps several open Tare windows (tabs, or the installed app next to a tab)
// in step. Each window holds its own copy of the data, so without this the
// window that saves last would silently undo changes made in another one.
// After every save a window announces it; the others reload from storage.

const tabId = Math.random().toString(36).slice(2);
let channel: BroadcastChannel | null = null;

export function initTabSync(onExternalChange: () => void, onKeyChanged: (env: Envelope) => void): void {
  if (!('BroadcastChannel' in window)) return;
  channel = new BroadcastChannel('tare-sync');
  channel.onmessage = async ev => {
    if (ev.data?.type !== 'saved' || ev.data.from === tabId) return;
    const { data, locked } = await loadData(app.store);
    if (data) {
      app.data = data;
      if (!data.settings.pin) app.key = null; // the PIN was turned off in the other window
      onExternalChange();
      return;
    }
    if (!isEnvelope(locked) || isLocked()) return; // a locked window reads the latest data when it unlocks
    if (!app.key) { onKeyChanged(locked); return; } // a PIN was set in the other window: lock here too, so this stale copy is never saved over it
    try {
      app.data = migrate(await unseal(locked, app.key));
      onExternalChange();
    } catch {
      onKeyChanged(locked); // the PIN was set or changed in the other window: ask for it here too
    }
  };
}

/** Tells other open windows that the saved data changed. */
export function announceSaved(): void {
  channel?.postMessage({ type: 'saved', from: tabId });
}
