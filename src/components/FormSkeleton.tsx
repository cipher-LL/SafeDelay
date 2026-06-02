

interface FormSkeletonProps {
  /** Optional: show a message while checking compile server status */
  compileServerStatus?: 'unknown' | 'checking' | 'online' | 'offline';
}

/** Skeleton loader for the SafeDelay forms — shown while wallet/network initializes */
export function FormSkeleton({ compileServerStatus }: FormSkeletonProps) {
  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.05)',
      borderRadius: 16,
      padding: 30,
      border: '1px solid rgba(255, 255, 255, 0.1)',
    }}>
      {/* Title + network badge skeleton */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ height: 28, background: 'rgba(255,255,255,0.07)', borderRadius: 6, width: 220 }} />
        <div style={{ height: 20, background: 'rgba(255,255,255,0.07)', borderRadius: 4, width: 100 }} />
      </div>

      {/* Description skeleton */}
      <div style={{ height: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 4, width: '70%', marginBottom: 24 }} />

      {/* Threshold select skeleton */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 4, width: 140, marginBottom: 8 }} />
        <div style={{ height: 40, background: 'rgba(255,255,255,0.07)', borderRadius: 8 }} />
      </div>

      {/* Owner addresses skeleton */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 4, width: 120, marginBottom: 12 }} />
        {[1, 2, 3].map(i => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ height: 24, width: 24, background: 'rgba(255,255,255,0.07)', borderRadius: 4 }} />
            <div style={{ height: 40, background: 'rgba(255,255,255,0.07)', borderRadius: 8, flex: 1 }} />
          </div>
        ))}
      </div>

      {/* Lock duration skeleton */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 4, width: 100, marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ height: 40, background: 'rgba(255,255,255,0.07)', borderRadius: 8, flex: 1 }} />
          <div style={{ height: 40, width: 100, background: 'rgba(255,255,255,0.07)', borderRadius: 8 }} />
        </div>
      </div>

      {/* Network status banner if checking */}
      {compileServerStatus === 'checking' && (
        <div style={{
          height: 40,
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 8,
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          padding: '0 1rem',
          gap: 8,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
          <div style={{ height: 10, background: 'rgba(255,255,255,0.1)', borderRadius: 4, width: 160 }} />
        </div>
      )}

      {/* Submit button skeleton */}
      <div style={{ height: 44, background: 'rgba(255,255,255,0.07)', borderRadius: 8, width: 160, marginTop: 4 }} />
    </div>
  );
}

export default FormSkeleton;