import { redirect } from 'next/navigation';

export default function VoicePage() {
  redirect('/conversations?tab=voice');
}
