'use client';
export default function ConversationError({ reset }: { reset: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center">
        <p className="text-sm text-red-500 mb-3">Failed to load conversation.</p>
        <button
          type="button"
          onClick={reset}
          className="text-sm text-emerald-600 underline hover:text-emerald-700"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
