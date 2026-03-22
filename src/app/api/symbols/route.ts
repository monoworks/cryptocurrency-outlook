import { NextResponse } from 'next/server';
import { getSymbolCategories } from '@/lib/symbol-resolver';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getSymbolCategories();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[/api/symbols] Error:', err);
    return NextResponse.json(
      { error: 'シンボル一覧の取得に失敗しました' },
      { status: 500 },
    );
  }
}
