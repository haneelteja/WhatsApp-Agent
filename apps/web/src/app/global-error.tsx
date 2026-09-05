'use client';

// Catches crashes inside the root layout itself — rendered without any layout.
// Cannot import @/lib/* here because the module graph that produced the crash
// may be what broke; raw console.error is the safe fallback.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('[ALPHABOT] [Runtime] GlobalError — root layout crash', {
    message:   error.message,
    digest:    error.digest,
    stack:     error.stack,
    timestamp: new Date().toISOString(),
  });

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f8fafc' }}>
        <div style={{
          display: 'flex', height: '100vh',
          alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div style={{
            background: '#fff', border: '1px solid #fee2e2', borderRadius: 16,
            padding: '2rem', maxWidth: 360, textAlign: 'center',
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12, background: '#fef2f2',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1rem',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 6 }}>
              Application Error
            </h2>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
              Something went wrong. Please refresh the page.
            </p>
            {error.digest && (
              <p style={{ fontSize: 11, color: '#d1d5db', fontFamily: 'monospace', marginBottom: 16 }}>
                ID: {error.digest}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={reset}
                style={{
                  padding: '8px 16px', background: '#059669', color: '#fff',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  padding: '8px 16px', background: '#f1f5f9', color: '#374151',
                  border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
