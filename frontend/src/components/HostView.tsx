import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PartyInfo, PartySyncState } from '../hooks/usePartyState';

interface HostViewProps {
  info: PartyInfo;
  state: PartySyncState;
  onBroadcast: (payload: { bpm: number }) => Promise<void>;
  onClear: () => Promise<void>;
}

const DEFAULT_STREAM_NAME = 'party';

function defaultMediamtxUrl() {
  try {
    const url = new URL(window.location.href);
    url.port = '8889';
    return url.origin;
  } catch (error) {
    return 'http://localhost:8889';
  }
}

export default function HostView({ info, state, onBroadcast, onClear }: HostViewProps) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const whipResourceRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'starting' | 'online' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [mediamtxUrl, setMediamtxUrl] = useState(() => defaultMediamtxUrl());
  const [streamName, setStreamName] = useState(DEFAULT_STREAM_NAME);
  const [localBpm, setLocalBpm] = useState<number | null>(null);
  const tapsRef = useRef<number[]>([]);

  const webhookUrl = useMemo(() => `${mediamtxUrl.replace(/\/$/, '')}/whip/${streamName}`, [mediamtxUrl, streamName]);

  const sendHostStatus = useCallback(async (connected: boolean) => {
    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'host-status', connected }),
      });
    } catch (error) {
      console.warn('Failed to update host status', error);
    }
  }, []);

  useEffect(() => {
    sendHostStatus(true);
    const interval = window.setInterval(() => {
      void sendHostStatus(true);
    }, 10000);
    return () => {
      window.clearInterval(interval);
      sendHostStatus(false);
      void stopBroadcast();
    };
  }, [sendHostStatus, stopBroadcast]);

  const waitForIceGathering = (pc: RTCPeerConnection) =>
    new Promise<void>((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      const checkState = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', checkState);
    });

  const startBroadcast = useCallback(async () => {
    if (status === 'starting' || status === 'online') {
      return;
    }
    setStatus('starting');
    setStatusMessage('Requesting audio capture…');
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
      streamRef.current = mediaStream;
      const pc = new RTCPeerConnection({ iceServers: [] });
      pcRef.current = pc;
      mediaStream.getTracks().forEach((track) => pc.addTrack(track, mediaStream));

      setStatusMessage('Creating WHIP offer…');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp ?? '',
      });

      if (!response.ok) {
        throw new Error(`WHIP error ${response.status}`);
      }

      const location = response.headers.get('location');
      if (location) {
        whipResourceRef.current = location;
      }

      const answerSdp = await response.text();
      const answer = { type: 'answer', sdp: answerSdp } as RTCSessionDescriptionInit;
      await pc.setRemoteDescription(answer);

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setStatus('online');
          setStatusMessage('Broadcasting to MediaMTX');
        } else if (pc.connectionState === 'failed') {
          setStatus('error');
          setStatusMessage('Peer connection failed. Try restarting.');
        }
      };
    } catch (error) {
      console.error(error);
      setStatus('error');
      setStatusMessage((error as Error).message ?? 'Failed to start broadcast');
      await stopBroadcast();
    }
  }, [status, webhookUrl]);

  const stopBroadcast = useCallback(async () => {
    pcRef.current?.getSenders().forEach((sender) => sender.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStatus('idle');
    setStatusMessage('');

    if (whipResourceRef.current) {
      try {
        await fetch(whipResourceRef.current, { method: 'DELETE' });
      } catch (error) {
        console.warn('Failed to release WHIP resource', error);
      }
      whipResourceRef.current = null;
    }
  }, []);

  const handleTap = useCallback(() => {
    const now = performance.now();
    const taps = [...tapsRef.current, now];
    const trimmed = taps.slice(-12);
    tapsRef.current = trimmed;
    if (trimmed.length < 2) {
      setLocalBpm(null);
      return;
    }
    const intervals = trimmed.slice(1).map((value, index) => value - trimmed[index]);
    const avgMs = intervals.reduce((acc, cur) => acc + cur, 0) / intervals.length;
    const bpm = 60000 / avgMs;
    setLocalBpm(Number.isFinite(bpm) ? bpm : null);
  }, []);

  const handleBroadcastBpm = useCallback(async () => {
    if (!localBpm) return;
    await onBroadcast({ bpm: localBpm });
  }, [localBpm, onBroadcast]);

  const handleClear = useCallback(async () => {
    tapsRef.current = [];
    setLocalBpm(null);
    await onClear();
  }, [onClear]);

  const hostPort = window.location.port || '4173';
  const localAddresses = info.localIPs.length
    ? info.localIPs.map((entry) => `http://${entry.address}:${hostPort}`).join(', ')
    : window.location.origin;

  return (
    <section className="panel">
      <h2>Host Control Center</h2>
      <p>Stream name: <strong>{streamName}</strong> · Guests join at <strong>{localAddresses || 'detecting…'}</strong></p>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h3>1. Broadcast audio to MediaMTX</h3>
        <div className="controls">
          <div className="field">
            <label htmlFor="host-mediamtx">MediaMTX URL</label>
            <input
              id="host-mediamtx"
              type="text"
              value={mediamtxUrl}
              onChange={(event) => setMediamtxUrl(event.target.value)}
              placeholder="http://localhost:8889"
            />
          </div>
          <div className="field">
            <label htmlFor="host-stream">Stream key</label>
            <input
              id="host-stream"
              type="text"
              value={streamName}
              onChange={(event) => setStreamName(event.target.value)}
            />
          </div>
          <button onClick={startBroadcast} disabled={status === 'starting' || status === 'online'}>
            Start broadcast
          </button>
          <button onClick={stopBroadcast} disabled={status === 'idle'}>
            Stop
          </button>
        </div>
        <p className="readout">Status: {statusMessage || status}</p>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h3>2. Tap the beat</h3>
        <div className="controls">
          <button onClick={handleTap}>Tap</button>
          <button onClick={handleBroadcastBpm} disabled={!localBpm}>Broadcast BPM</button>
          <button onClick={handleClear}>Clear</button>
          <span className="readout">Local BPM: {localBpm ? localBpm.toFixed(2) : '—'}</span>
          <span className="readout">Active BPM: {state.bpm ? state.bpm.toFixed(2) : '—'}</span>
        </div>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h3>3. Tips</h3>
        <ul>
          <li>Use a loopback or virtual cable to route your DJ software into the browser capture.</li>
          <li>For tighter sync, ask guests to tap along and hit “Align to Beat”.</li>
          <li>OBS or another encoder can push RTMP to <code>{`${mediamtxUrl.replace(/\/$/, '')}/live/${streamName}`}</code> as a fallback.</li>
        </ul>
      </div>
    </section>
  );
}
