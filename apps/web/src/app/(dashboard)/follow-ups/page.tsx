import { redirect } from 'next/navigation';

export default function FollowUpsPage() {
  redirect('/settings?tab=follow-ups');
}
