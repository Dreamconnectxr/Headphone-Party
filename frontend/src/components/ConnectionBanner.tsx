import { useEffect, useState } from 'react';

interface Props {
  hostConnected: boolean;
  bpm: number | null;
  lastUpdated: number | null;
}

export default function ConnectionBanner({ hostConnected, bpm, lastUpdated }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const secondsAgo = lastUpdated ? Math.floor((now - lastUpdated) / 1000) : null;

  return (
    <section className="panel" style={{ margin: '1rem', marginBottom: 0 }}>
      <div className="controls" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="status-pill" style={{ background: hostConnected ? 'rgba(46, 204, 113, 0.22)' : 'rgba(231, 76, 60, 0.22)' }}>
          {hostConnected ? 'Host connected' : 'Host offline'}
        </span>
        <span className="readout">BPM: {bpm ? bpm.toFixed(2) : '—'}</span>
        <span className="readout">Last sync: {secondsAgo != null ? `${secondsAgo}s ago` : '—'}</span>
      </div>
    </section>
  );
}
