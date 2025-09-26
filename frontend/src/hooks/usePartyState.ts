import { useCallback, useEffect, useMemo, useState } from 'react';

export type PartyInfo = {
  name: string;
  localIPs: Array<{ interface: string; address: string }>;
  bpm: number | null;
  beatTimestamp: number | null;
  hostConnected: boolean;
};

export type PartySyncState = {
  bpm: number | null;
  beatTimestamp: number | null;
  messageId: number;
  hostConnected: boolean;
  serverTime: number;
};

export type SyncUpdatePayload = {
  bpm: number;
};

type SendSyncMessage = (message: { type: 'sync-update'; bpm: number } | { type: 'sync-clear' }) => Promise<void>;

const defaultState: PartySyncState = {
  bpm: null,
  beatTimestamp: null,
  messageId: 0,
  hostConnected: false,
  serverTime: Date.now(),
};

export function usePartyState() {
  const [info, setInfo] = useState<PartyInfo>({
    name: 'Headphone Party',
    localIPs: [],
    bpm: null,
    beatTimestamp: null,
    hostConnected: false,
  });
  const [state, setState] = useState<PartySyncState>(defaultState);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/info')
      .then((res) => res.json())
      .then((payload) => setInfo(payload as PartyInfo))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/state')
      .then((res) => res.json())
      .then((payload) => {
        setState(payload as PartySyncState);
        setLastUpdated(Date.now());
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const source = new EventSource('/api/events');
    source.addEventListener('state', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as PartySyncState;
        setState(payload);
        setLastUpdated(Date.now());
      } catch (error) {
        console.warn('Failed to parse state event', error);
      }
    });
    source.addEventListener('host', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { connected: boolean };
        setState((prev) => ({ ...prev, hostConnected: payload.connected }));
      } catch (error) {
        console.warn('Failed to parse host event', error);
      }
    });
    source.onerror = () => {
      setTimeout(() => source.close(), 0);
    };
    return () => {
      source.close();
    };
  }, []);

  const sendSync = useCallback<SendSyncMessage>(async (message) => {
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
  }, []);

  return useMemo(
    () => ({ info, state, lastUpdated, sendSync }),
    [info, state, lastUpdated, sendSync]
  );
}
