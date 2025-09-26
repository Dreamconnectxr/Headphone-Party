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

function buildWhipUrl(baseUrl: string, streamName: string) {
  return `${baseUrl.replace(/\/$/, '')}/whip/${streamName}`;
}

function buildWhepUrl(baseUrl: string, streamName: string) {
  return `${baseUrl.replace(/\/$/, '')}/whep/${streamName}`;
}

export default function HostView({ info, state, onBroadcast, onClear }: HostViewProps) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const whipResourceRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'starting' | 'online' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [mediamtxUrl, setMediamtxUrl] = useState(() => defaultMediamtxUrl());
  const [streamName, setStreamName] = useState(DEFAULT_STREAM_NAME);
  const [captureMode, setCaptureMode] = useState<'microphone' | 'system'>('microphone');
  const [localBpm, setLocalBpm] = useState<number | null>(null);
  const tapsRef = useRef<number[]>([]);
  const insecureCaptureWarning = useMemo(() => {
    const hostname = window.location.hostname;
    if (window.isSecureContext) {
      return false;
    }
    return !['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  }, []);

  const whipUrl = useMemo(() => buildWhipUrl(mediamtxUrl, streamName), [mediamtxUrl, streamName]);
  const whepUrl = useMemo(() => buildWhepUrl(mediamtxUrl, streamName), [mediamtxUrl, streamName]);

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
    setStatusMessage(
      captureMode === 'system' ? 'Pick a tab or window to capture audio…' : 'Requesting audio capture…',
    );

    try {
      let mediaStream: MediaStream;
      if (captureMode === 'system') {
        const captureStream = await navigator.mediaDevices.getDisplayMedia({
          audio: { echoCancellation: false, noiseSuppression: false },
          video: true,
        });
        const audioTracks = captureStream.getAudioTracks();
        captureStream.getVideoTracks().forEach((track) => track.stop());
        if (!audioTracks.length) {
          throw new Error('System capture did not provide an audio track. Try the microphone mode instead.');
        }
        mediaStream = new MediaStream();
        audioTracks.forEach((track) => mediaStream.addTrack(track));
      } else {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false },
        });
      }

      streamRef.current = mediaStream;
      const pc = new RTCPeerConnection({ iceServers: [] });
      pcRef.current = pc;
      mediaStream.getTracks().forEach((track) => pc.addTrack(track, mediaStream));

      setStatusMessage('Creating WHIP offer…');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);

      setStatusMessage('Publishing to MediaMTX…');
      const response = await fetch(whipUrl, {
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
  }, [captureMode, status, stopBroadcast, whipUrl]);

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
      <p>
        Stream name: <strong>{streamName}</strong> · Guests join at{' '}
        <strong>{localAddresses || 'detecting…'}</strong>
      </p>

      {insecureCaptureWarning && (
        <div className="panel alert">
          <h3>Enable microphone capture</h3>
          <p>
            Browsers only expose microphones from a secure context. Open this page from{' '}
            <code>http://localhost:4173/host</code> (or an HTTPS URL) on the DJ computer and share the LAN
            links with guests separately.
          </p>
        </div>
      )}

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h3>1. Broadcast audio to MediaMTX</h3>
        <div className="controls">
          <div className="field">
            <label htmlFor="capture-mode">Audio source</label>
            <select
              id="capture-mode"
              value={captureMode}
              onChange={(event) => setCaptureMode(event.target.value as 'microphone' | 'system')}
            >
              <option value="microphone">Microphone / line-in (loopback cable)</option>
              <option value="system">System audio (share a tab/window e.g. YouTube)</option>
            </select>
            {captureMode === 'system' ? (
              <p className="hint">
                Your browser will prompt you to pick a tab or window. Choose the one playing music (YouTube, etc.) and enable
                <strong> Share audio</strong>. Video is discarded before sending to MediaMTX.
              </p>
            ) : (
              <p className="hint">Use a loopback device (VB-Cable, BlackHole, etc.) to pipe your DJ software into the browser.</p>
            )}
          </div>
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
          <div className="field">
            <button className="primary" onClick={() => void startBroadcast()} disabled={status === 'starting' || status === 'online'}>
              {status === 'online' ? 'Broadcasting' : 'Start broadcast'}
            </button>
            <button onClick={() => void stopBroadcast()} disabled={status === 'idle'}>
              Stop
            </button>
          </div>
        </div>
        <p className="readout">Status: {statusMessage || status}</p>
        {status === 'error' && (
          <p className="error">{statusMessage || 'Unable to publish audio. Check your device permissions or MediaMTX URL.'}</p>
        )}
        {status !== 'online' && captureMode === 'system' && (
          <p className="hint">Tip: In Chrome, share the YouTube tab with audio to stream remote content to your guests.</p>
        )}
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h3>2. Tap the beat</h3>
        <div className="controls">
          <button onClick={handleTap}>Tap</button>
          <button onClick={() => void handleBroadcastBpm()} disabled={!localBpm}>
            Broadcast BPM
          </button>
          <button onClick={() => void handleClear()}>Clear</button>
          <span className="readout">Local BPM: {localBpm ? localBpm.toFixed(2) : '—'}</span>
          <span className="readout">Active BPM: {state.bpm ? state.bpm.toFixed(2) : '—'}</span>
        </div>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h3>3. Share these stream details</h3>
        <ul>
          <li>
            WHIP publish URL (browser capture): <code>{whipUrl}</code>
          </li>
          <li>
            WHEP playback URL (guests pull from here): <code>{whepUrl}</code>
          </li>
          <li>
            OBS / RTMP fallback: <code>rtmp://[this machine]:1935/live</code> with stream key <code>{streamName}</code>
          </li>
        </ul>
        <p className="hint">
          Use RTMP if you want to stream from external software (OBS, ffmpeg, etc.). Guests automatically keep playing the WHEP
          stream.
        </p>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h3>4. Party health</h3>
        <ul>
          <li>Host connected: {state.hostConnected ? '✅ Online' : '⚠️ Offline'}</li>
          <li>BPM broadcast: {state.bpm ? `${state.bpm.toFixed(2)} BPM` : '—'}</li>
          <li>Guests should visit: <code>{localAddresses || 'http://localhost:4173'}</code></li>
        </ul>
      </div>
    </section>
  );
}
