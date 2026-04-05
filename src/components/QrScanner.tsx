/**
 * QrScanner - Camera-based QR code scanner for WIF key import
 *
 * Uses html5-qrcode to access the device camera and scan QR codes.
 * Validates scanned data as WIF before returning it.
 */

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import styled from 'styled-components';
import { decodePrivateKeyWif } from '@bitauth/libauth';

const ScannerContainer = styled.div`
  margin-bottom: 12px;
`;

const ScanButton = styled.button`
  padding: 8px 16px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  background: rgba(79, 70, 229, 0.2);
  color: #a5b4fc;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;

  &:hover {
    background: rgba(79, 70, 229, 0.4);
    border-color: #4f46e5;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ScannerBox = styled.div`
  border: 1px solid rgba(79, 70, 229, 0.4);
  border-radius: 8px;
  overflow: hidden;
  margin-top: 8px;
  background: rgba(0, 0, 0, 0.4);
`;

const ScannerHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(79, 70, 229, 0.15);
  border-bottom: 1px solid rgba(79, 70, 229, 0.2);
`;

const ScannerTitle = styled.span`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
`;

const CloseScannerBtn = styled.button`
  padding: 2px 8px;
  border: none;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  font-size: 11px;
  cursor: pointer;

  &:hover {
    background: rgba(239, 68, 68, 0.3);
  }
`;

const ScannerRegion = styled.div`
  width: 100%;
  max-width: 300px;
  margin: 0 auto;

  video {
    width: 100% !important;
    border-radius: 4px;
  }
`;

const ScannerHelp = styled.div`
  padding: 8px 12px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
`;

const ErrorText = styled.div`
  padding: 6px 12px;
  font-size: 12px;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 4px;
  margin-top: 6px;
`;

interface QrScannerProps {
  onScan: (wifKey: string) => void;
  disabled?: boolean;
}

/**
 * Validate a string as a WIF key.
 * Returns the key if valid, throws descriptive error if not.
 */
function validateWifKey(data: string): string {
  const trimmed = data.trim();

  // WIF is typically 51 or 52 base58 characters
  if (trimmed.length < 50 || trimmed.length > 53) {
    throw new Error(`Invalid WIF length: ${trimmed.length} chars (expected 51 or 52)`);
  }

  // WIF mainnet starts with K or L
  // Testnet/chipnet starts with c
  const firstChar = trimmed[0];
  const isValidPrefix = ['K', 'L', 'c'].includes(firstChar);
  if (!isValidPrefix) {
    throw new Error(`Invalid WIF prefix: "${firstChar}" (expected K, L, or c)`);
  }

  // Try to decode — will throw if invalid base58
  const decoded = decodePrivateKeyWif(trimmed);
  if (typeof decoded === 'string') {
    throw new Error(`Invalid WIF: ${decoded}`);
  }

  return trimmed;
}

export default function QrScanner({ onScan, disabled }: QrScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerIdRef = useRef<string>(`qr-scanner-${Math.random().toString(36).slice(2, 8)}`);

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2 /* SCANNING */) {
          await scannerRef.current.stop();
        }
      } catch {
        // ignore stop errors
      }
      scannerRef.current = null;
    }
    setScanning(false);
    setError(null);
    setCameraError(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        try {
          const state = scannerRef.current.getState();
          if (state === 2 /* SCANNING */) {
            scannerRef.current.stop().catch(() => {});
          }
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const startScanner = async () => {
    setError(null);
    setCameraError(null);

    const containerId = containerIdRef.current;

    try {
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          // QR code detected — validate as WIF
          try {
            const wifKey = validateWifKey(decodedText);
            // Success — stop scanner and pass key up
            scanner.stop().catch(() => {});
            scannerRef.current = null;
            setScanning(false);
            setError(null);
            setCameraError(null);
            onScan(wifKey);
          } catch (e) {
            // Not a valid WIF QR — show error and continue scanning
            setError(e instanceof Error ? e.message : 'Not a valid WIF key');
          }
        },
        () => {
          // QR code parse error — ignore, keep scanning
        }
      );

      setScanning(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      let userMsg = msg;

      if (msg.includes('Permission') || msg.includes('NotAllowedError') || msg.includes('permission')) {
        userMsg = 'Camera access denied. Please allow camera access in your browser settings.';
      } else if (msg.includes('NotFoundError') || msg.includes('no cameras')) {
        userMsg = 'No camera found on this device.';
      } else if (msg.includes('NotSupported')) {
        userMsg = 'Camera scanning not supported in this browser.';
      }

      setCameraError(userMsg);
      scannerRef.current = null;
    }
  };

  return (
    <ScannerContainer>
      {!scanning ? (
        <div>
          <ScanButton onClick={startScanner} disabled={disabled}>
            📷 Scan QR Code
          </ScanButton>
          {cameraError && (
            <ErrorText>⚠️ {cameraError}</ErrorText>
          )}
        </div>
      ) : (
        <ScannerBox>
          <ScannerHeader>
            <ScannerTitle>📷 Scanning WIF QR...</ScannerTitle>
            <CloseScannerBtn onClick={stopScanner}>✕ Stop</CloseScannerBtn>
          </ScannerHeader>
          <ScannerRegion id={containerIdRef.current} />
          <ScannerHelp>
            Point camera at a QR code containing your WIF private key
          </ScannerHelp>
          {error && (
            <ErrorText style={{ margin: '0 12px 8px' }}>
              ⚠️ {error} — keep scanning or try manual entry
            </ErrorText>
          )}
        </ScannerBox>
      )}
    </ScannerContainer>
  );
}
