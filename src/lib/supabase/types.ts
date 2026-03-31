export type UserRole = "user" | "admin";

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  credits: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  user_id: string;
  amount: number;
  credits_added: number;
  pg_transaction_id: string | null;
  status: "pending" | "completed" | "failed" | "refunded";
  created_at: string;
}

export interface Conversion {
  id: string;
  user_id: string;
  pdf_name: string | null;
  problem_count: number;
  credits_used: number;
  status: "started" | "completed" | "failed";
  created_at: string;
}

export interface ErrorLog {
  id: string;
  user_id: string;
  conversion_id: string | null;
  error_type: string;
  error_message: string;
  stack_trace: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface DeductCreditsResult {
  success: boolean;
  error?: string;
  conversion_id?: string;
  remaining_credits?: number;
  credits?: number;
  required?: number;
  expires_at?: string;
}

export interface AddCreditsResult {
  success: boolean;
  payment_id?: string;
  new_credits?: number;
}
