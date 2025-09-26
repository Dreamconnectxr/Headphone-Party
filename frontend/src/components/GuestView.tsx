import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PartySyncState } from '../hooks/usePartyState';

interface GuestViewProps {
  state: PartySyncState;
}

const MAX_DELAY_MS = 2000;
const VISUALIZER_BARS = 32;
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

export default function GuestView({ state }: GuestViewProps) {
  const [mediamtxUrl, setMediamtxUrl] = useState(() => defaultMediamtxUrl());
  const [streamName, setStreamName] = useState(DEFAULT_STREAM_NAME);
  const [delayMs, setDelayMs] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [personalBpm, setPersonalBpm] = useState<number | null>(null);
  const tapsRef = useRef<number[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number>();
  const serverOffsetRef = useRef(0);
  const [visualizer, setVisualizer] = useState<number[]>(() => Array.from({ length: VISUALIZER_BARS }, () => 0));

  const whepUrl = useMemo(() => `${mediamtxUrl.replace(/\/$/, '')}/whep/${streamName}`, [mediamtxUrl, streamName]);

  const ensureAudioGraph = useCallback(() => {
    if (!audioCtxRef.current) {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const delayNode = ctx.createDelay(MAX_DELAY_MS / 1000);
      delayNode.delayTime.value = delayMs / 1000;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      const gain = ctx.createGain();
      delayNode.connect(gain).connect(analyser).connect(ctx.destination);
      delayNodeRef.current = delayNode;
      analyserRef.current = analyser;
      startVisualizer();
    }
  }, [delayMs]);

  const startVisualizer = useCallback(() => {
    if (!analyserRef.current) return;
    const analyser = analyserRef.current;
    const buffer = new Uint8Array(analyser.frequencyBinCount);

    const loop = () => {
      analyser.getByteFrequencyData(buffer);
      const bucketSize = Math.floor(buffer.length / VISUALIZER_BARS);
      const bars = Array.from({ length: VISUALIZER_BARS }, (_, index) => {
        const start = index * bucketSize;
        let sum = 0;
        for (let i = 0; i < bucketSize; i += 1) {
          sum += buffer[start + i] ?? 0;
        }
        return sum / bucketSize;
      });
      setVisualizer(bars);
      frameRef.current = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(frameRef.current ?? 0);
    frameRef.current = requestAnimationFrame(loop);
  }, []);

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

  const connectStream = useCallback(async () => {
    setConnectionStatus('connecting');
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pcRef.current = pc;
      ensureAudioGraph();

      pc.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        if (!audioCtxRef.current || !delayNodeRef.current) return;
        sourceRef.current?.disconnect();
        const source = audioCtxRef.current.createMediaStreamSource(stream);
        source.connect(delayNodeRef.current);
        sourceRef.current = source;
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setConnectionStatus('connected');
        } else if (pc.connectionState === 'failed') {
          setConnectionStatus('failed');
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);

      const response = await fetch(whepUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          Accept: 'application/sdp',
        },
        body: offer.sdp ?? '',
      });

      if (!response.ok) {
        throw new Error(`WHEP error ${response.status}`);
      }

      const answerSdp = await response.text();
      const answer = { type: 'answer', sdp: answerSdp } as RTCSessionDescriptionInit;
      await pc.setRemoteDescription(answer);
      setConnectionStatus('connected');
    } catch (error) {
      console.error(error);
      setConnectionStatus('failed');
      pcRef.current?.close();
      pcRef.current = null;
    }
  }, [ensureAudioGraph, whepUrl]);

  const disconnectStream = useCallback(() => {
    pcRef.current?.getReceivers().forEach((receiver) => receiver.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    setConnectionStatus('idle');
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    connectStream();
    return () => {
      disconnectStream();
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
      cancelAnimationFrame(frameRef.current ?? 0);
    };
  }, [connectStream, disconnectStream]);

  useEffect(() => {
    serverOffsetRef.current = state.serverTime ? state.serverTime - Date.now() : 0;
  }, [state.serverTime]);

  const applyDelay = useCallback(
    (value: number) => {
      const clamped = Math.max(0, Math.min(MAX_DELAY_MS, value));
      setDelayMs(clamped);
      if (delayNodeRef.current) {
        delayNodeRef.current.delayTime.value = clamped / 1000;
      }
    },
    []
  );

  const handleDelayChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    applyDelay(Number(event.target.value));
  };

  const handleNudge = (amount: number) => {
    applyDelay(delayMs + amount);
  };

  const togglePlayback = async () => {
    if (!audioCtxRef.current) {
      ensureAudioGraph();
    }
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      await ctx.resume();
      setIsPlaying(true);
    } else {
      await ctx.suspend();
      setIsPlaying(false);
    }
  };

  const alignToBeat = useCallback(() => {
    if (!state.bpm || !state.beatTimestamp) return;
    const beatDuration = 60000 / state.bpm;
    const now = Date.now() + serverOffsetRef.current;
    const elapsed = (now - state.beatTimestamp) % beatDuration;
    const recommended = beatDuration - elapsed;
    applyDelay(recommended);
  }, [applyDelay, state.bpm, state.beatTimestamp]);

  const handleTap = useCallback(() => {
    const now = performance.now();
    const taps = [...tapsRef.current, now];
    const trimmed = taps.slice(-10);
    tapsRef.current = trimmed;
    if (trimmed.length < 2) {
      setPersonalBpm(null);
      return;
    }
    const intervals = trimmed.slice(1).map((value, index) => value - trimmed[index]);
    const avgMs = intervals.reduce((acc, cur) => acc + cur, 0) / intervals.length;
    const bpm = 60000 / avgMs;
    setPersonalBpm(Number.isFinite(bpm) ? bpm : null);
  }, []);

  return (
    <section className="panel">
      <h2>Guest Player</h2>
      <div className="controls">
        <div className="field">
          <label htmlFor="guest-mediamtx">MediaMTX URL</label>
          <input id="guest-mediamtx" value={mediamtxUrl} onChange={(event) => setMediamtxUrl(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="guest-stream">Stream key</label>
          <input id="guest-stream" value={streamName} onChange={(event) => setStreamName(event.target.value)} />
        </div>
        <button onClick={connectStream} disabled={connectionStatus === 'connecting'}>
          Reconnect
        </button>
        <button onClick={disconnectStream}>Disconnect</button>
        <button onClick={togglePlayback}>{isPlaying ? 'Pause' : 'Play'}</button>
      </div>
      <p className="readout">Connection: {connectionStatus}</p>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h3>Delay Alignment</h3>
        <div className="delay-slider">
          <input
            type="range"
            min={0}
            max={MAX_DELAY_MS}
            step={5}
            value={delayMs}
            onChange={handleDelayChange}
          />
          <span className="readout">{delayMs.toFixed(0)} ms</span>
        </div>
        <div className="controls">
          <button onClick={() => handleNudge(-10)}>-10 ms</button>
          <button onClick={() => handleNudge(10)}>+10 ms</button>
          <button onClick={alignToBeat} disabled={!state.bpm}>Align to Beat</button>
        </div>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h3>BPM Tap</h3>
        <div className="controls">
          <button onClick={handleTap}>Tap</button>
          <span className="readout">Your BPM: {personalBpm ? personalBpm.toFixed(2) : '—'}</span>
          <span className="readout">Party BPM: {state.bpm ? state.bpm.toFixed(2) : '—'}</span>
        </div>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h3>Visualizer</h3>
        <div className="visualizer">
          {visualizer.map((value, index) => (
            <span key={index} style={{ height: `${Math.max(4, value / 2)}%` }} />
          ))}
        </div>
      </div>
    </section>
  );
}
