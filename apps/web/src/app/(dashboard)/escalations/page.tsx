import { redirect } from 'next/navigation';

export default function EscalationsPage() {
  redirect('/conversations?status=escalated');
}
