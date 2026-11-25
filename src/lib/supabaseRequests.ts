import { supabase, isSupabaseConfigured } from './supabase';
import { sanitizeObjectTree } from './security';

export type ServiceRequestType =
  | 'towing'
  | 'haulage'
  | 'rental'
  | 'car_viewing'
  | 'part_review'
  | 'career_application';

export type ServiceRequestStatus = 'new' | 'in_progress' | 'completed' | 'archived';

export interface ServiceRequestRecord {
  id: string;
  request_type: ServiceRequestType;
  customer_name: string;
  phone?: string | null;
  email?: string | null;
  subject?: string | null;
  payload: Record<string, unknown>;
  status: ServiceRequestStatus;
  created_at: string;
  updated_at: string;
}

export interface NewsletterSubscriber {
  id: string;
  email: string;
  source: string;
  created_at: string;
}

export interface SubmitServiceRequestInput {
  requestType: ServiceRequestType;
  customerName: string;
  phone?: string;
  email?: string;
  subject?: string;
  payload?: Record<string, unknown>;
}

/**
 * Submits a customer request (towing, haulage quote, rental reservation, car viewing,
 * part review, or career application) to Supabase. Fails gracefully if tables aren't
 * provisioned yet so the public UX is never blocked.
 */
export async function submitServiceRequest(
  input: SubmitServiceRequestInput
): Promise<{ savedToCloud: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { savedToCloud: false, error: 'Supabase not configured' };
  }

  const cleanName = input.customerName.trim().slice(0, 150);
  if (!cleanName) {
    return { savedToCloud: false, error: 'Customer name is required' };
  }

  try {
    const { error } = await supabase.from('service_requests').insert({
      request_type: input.requestType,
      customer_name: cleanName,
      phone: input.phone ? input.phone.trim().slice(0, 40) : null,
      email: input.email ? input.email.trim().slice(0, 160) : null,
      subject: input.subject ? input.subject.trim().slice(0, 200) : null,
      payload: sanitizeObjectTree(input.payload || {}),
      status: 'new',
    });

    if (error) {
      console.warn('[supabaseRequests] service_requests insert skipped:', error.message);
      return { savedToCloud: false, error: error.message };
    }
    return { savedToCloud: true };
  } catch (err: any) {
    console.warn('[supabaseRequests] service_requests network error:', err?.message);
    return { savedToCloud: false, error: err?.message || 'Network error' };
  }
}

/**
 * Subscribes an email address to the newsletter_subscribers table.
 */
export async function submitNewsletterSubscription(
  email: string,
  source: 'footer' | 'blog' = 'footer'
): Promise<{ savedToCloud: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { savedToCloud: false };
  }

  const cleanEmail = email.trim().toLowerCase().slice(0, 160);
  if (!cleanEmail) {
    return { savedToCloud: false, error: 'Email is required' };
  }

  try {
    const { error } = await supabase
      .from('newsletter_subscribers')
      .insert({ email: cleanEmail, source });

    // Ignore duplicate email unique violation (23505) gracefully
    if (error && error.code !== '23505') {
      console.warn('[supabaseRequests] newsletter insert skipped:', error.message);
      return { savedToCloud: false, error: error.message };
    }
    return { savedToCloud: true };
  } catch (err: any) {
    return { savedToCloud: false, error: err?.message };
  }
}

export async function getServiceRequests(): Promise<{
  data: ServiceRequestRecord[];
  error?: string;
}> {
  if (!isSupabaseConfigured() || !supabase) {
    return { data: [], error: 'Supabase is not configured.' };
  }

  const { data, error } = await supabase
    .from('service_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(250);

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data || []) as ServiceRequestRecord[] };
}

export async function updateServiceRequestStatus(
  id: string,
  status: ServiceRequestStatus
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Supabase is not configured.' };
  }

  const { error } = await supabase
    .from('service_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function deleteServiceRequest(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Supabase is not configured.' };
  }

  const { error } = await supabase.from('service_requests').delete().eq('id', id);
  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function getNewsletterSubscribers(): Promise<{
  data: NewsletterSubscriber[];
  error?: string;
}> {
  if (!isSupabaseConfigured() || !supabase) {
    return { data: [], error: 'Supabase is not configured.' };
  }

  const { data, error } = await supabase
    .from('newsletter_subscribers')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data || []) as NewsletterSubscriber[] };
}

export async function deleteNewsletterSubscriber(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Supabase is not configured.' };
  }

  const { error } = await supabase.from('newsletter_subscribers').delete().eq('id', id);
  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}
