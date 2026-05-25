import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { apiSuccess, withErrorHandler, AppError } from '@/lib/api-utils';

async function getHandler(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  // Get current balance
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('credit_balance, total_messages_sent, total_selfies_received')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    throw new AppError('Profile not found', 404);
  }

  // Get recent transactions (last 20)
  const { data: transactions } = await supabase
    .from('credit_transactions')
    .select('id, tx_type, amount, balance_after, description, price_usd, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  return apiSuccess({
    balance: profile.credit_balance,
    stats: {
      total_messages_sent: profile.total_messages_sent,
      total_selfies_received: profile.total_selfies_received,
    },
    transactions: transactions || [],
  });
}

export const GET = withErrorHandler(getHandler);
