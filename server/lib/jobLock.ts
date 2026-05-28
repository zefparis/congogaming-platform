import { supabaseAdmin } from './supabase.js';

export async function acquireJobLock(jobName: string, slotKey: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from('job_locks').insert({
    job_name: jobName,
    slot_key: slotKey,
  });
  if (error) {
    if (error.code === '23505') return false;
    throw new Error(error.message);
  }
  return true;
}
