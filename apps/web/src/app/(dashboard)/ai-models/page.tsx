import { redirect } from 'next/navigation';

export default function AiModelsPage() {
  redirect('/settings?tab=models');
}
