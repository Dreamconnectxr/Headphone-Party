import { useMemo } from 'react';
import HostView from './components/HostView';
import GuestView from './components/GuestView';
import QrPage from './components/QrPage';
import ConnectionBanner from './components/ConnectionBanner';
import { usePartyState } from './hooks/usePartyState';
import { useRoute } from './hooks/useRoute';

export type PartyPage = 'guest' | 'host' | 'qr';

export default function App() {
  const route = useRoute();
  const { info, state, lastUpdated, sendSync } = usePartyState();

  const page = useMemo<PartyPage>(() => {
    if (route.pathname.startsWith('/host')) return 'host';
    if (route.pathname.startsWith('/qr')) return 'qr';
    return 'guest';
  }, [route.pathname]);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <h1>🎧 Headphone Party</h1>
        <nav className="controls">
          <a href="/">Guest</a>
          <a href="/host">Host</a>
          <a href="/qr">QR</a>
        </nav>
      </header>
      <ConnectionBanner
        hostConnected={state.hostConnected}
        bpm={state.bpm}
        lastUpdated={lastUpdated}
      />
      <main className="main-content">
        {page === 'host' && (
          <HostView
            info={info}
            state={state}
            onBroadcast={(payload) => sendSync({ type: 'sync-update', ...payload })}
            onClear={() => sendSync({ type: 'sync-clear' })}
          />
        )}
        {page === 'guest' && <GuestView state={state} />}
        {page === 'qr' && <QrPage info={info} />}
      </main>
    </div>
  );
}
