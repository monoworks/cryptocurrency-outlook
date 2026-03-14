import { NextResponse } from 'next/server';
import { debugTelegramSend } from '@/lib/telegram';

export async function GET() {
  const result = await debugTelegramSend();
  return NextResponse.json({ result });
}
