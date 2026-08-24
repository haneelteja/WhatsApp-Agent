import { redirect } from 'next/navigation';

export default function ContactsPage() {
  redirect('/conversations?tab=contacts');
}
