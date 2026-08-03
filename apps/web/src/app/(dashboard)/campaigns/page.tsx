export const dynamic = 'force-dynamic';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import {
  Megaphone, MessageSquare, Phone, Users, CheckCircle2,
  Clock, PlayCircle, PauseCircle, Ban, PhoneCall,
} from 'lucide-react';
import Link from 'next/link';

export default function CampaignsPage() {
  void getSupabaseServerClient;
  void getSupabaseAdminClient;
  void redirect;
  void Megaphone; void MessageSquare; void Phone; void Users; void CheckCircle2;
  void Clock; void PlayCircle; void PauseCircle; void Ban; void PhoneCall;
  void Link;
  return <div style={{ padding: 40 }}>Imports OK ✓</div>;
}
