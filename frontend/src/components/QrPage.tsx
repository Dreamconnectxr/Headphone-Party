import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import type { PartyInfo } from '../hooks/usePartyState';

interface Props {
  info: PartyInfo;
}

export default function QrPage({ info }: Props) {
  const [qrData, setQrData] = useState<string>('');

  const joinUrl = useMemo(() => {
    if (info.localIPs.length > 0) {
      const port = window.location.port || '4173';
      return `http://${info.localIPs[0]?.address}:${port}`;
    }
    return window.location.origin;
  }, [info.localIPs]);

  useEffect(() => {
    QRCode.toDataURL(joinUrl, { margin: 1, width: 320 })
      .then(setQrData)
      .catch((error) => console.error('Failed to generate QR', error));
  }, [joinUrl]);

  return (
    <div className="qr-wrapper">
      <div className="qr-card">
        <h2>Join Headphone Party</h2>
        {qrData ? <img className="qr-code" src={qrData} alt={`QR code for ${joinUrl}`} /> : <p>Preparing QR…</p>}
        <p className="readout">{joinUrl}</p>
        <p>Ask guests to connect to the same Wi-Fi and scan the code.</p>
      </div>
    </div>
  );
}
