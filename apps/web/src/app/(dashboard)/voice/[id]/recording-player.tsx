'use client';

export function RecordingPlayer({ url }: { url: string }) {
  return (
    <audio
      controls
      src={url}
      className="w-full h-10 rounded-lg"
      preload="metadata"
    >
      Your browser does not support audio playback.{' '}
      <a href={url} target="_blank" rel="noopener noreferrer" className="underline text-emerald-600">
        Download recording
      </a>
    </audio>
  );
}
