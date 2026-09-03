import { getSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getContactsAction, getMetaTemplatesAction } from '@/app/actions/scheduled-messages';
import { NewScheduledMessageForm } from './NewScheduledMessageForm';

export default async function NewScheduledMessagePage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [contacts, templates] = await Promise.all([
    getContactsAction(),
    getMetaTemplatesAction(),
  ]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <NewScheduledMessageForm contacts={contacts} templates={templates} />
    </div>
  );
}
