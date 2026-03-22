import { NextResponse } from 'next/server';

const INFO_URL = 'https://api.hyperliquid.xyz/info';

export const dynamic = 'force-dynamic';

export async function GET() {
  const results: Record<string, unknown> = {};

  // 1. Test perpDexs
  try {
    const res = await fetch(INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'perpDexs' }),
    });
    results.perpDexs_status = res.status;
    if (res.ok) {
      const data = await res.json();
      // Only return first few entries and their structure
      results.perpDexs_count = Array.isArray(data) ? data.length : 'not_array';
      results.perpDexs_sample = Array.isArray(data) ? data.slice(0, 5).map((d: Record<string, unknown> | null) => d ? { name: d.name, fullName: d.fullName, keys: Object.keys(d) } : null) : data;
    } else {
      results.perpDexs_body = await res.text();
    }
  } catch (err) {
    results.perpDexs_error = String(err);
  }

  // 2. Test metaAndAssetCtxs (main — no dex)
  try {
    const res = await fetch(INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    results.main_meta_status = res.status;
    if (res.ok) {
      const data = await res.json();
      const meta = data[0];
      results.main_universe_count = meta?.universe?.length;
      // Show first 5 and last 5 assets to see if builder perps are included
      results.main_universe_first5 = meta?.universe?.slice(0, 5).map((u: Record<string, unknown>) => u.name);
      results.main_universe_last5 = meta?.universe?.slice(-5).map((u: Record<string, unknown>) => u.name);
      // Check for any colon-containing names
      const colonNames = meta?.universe?.filter((u: Record<string, unknown>) => typeof u.name === 'string' && u.name.includes(':')).map((u: Record<string, unknown>) => u.name);
      results.main_universe_colon_names = colonNames?.slice(0, 20);
      results.main_universe_colon_count = colonNames?.length;
    } else {
      results.main_meta_body = await res.text();
    }
  } catch (err) {
    results.main_meta_error = String(err);
  }

  // 3. Try metaAndAssetCtxs with dex="xyz"
  try {
    const res = await fetch(INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs', dex: 'xyz' }),
    });
    results.xyz_meta_status = res.status;
    if (res.ok) {
      const data = await res.json();
      const meta = data[0];
      results.xyz_universe_count = meta?.universe?.length;
      results.xyz_universe_first10 = meta?.universe?.slice(0, 10).map((u: Record<string, unknown>) => u.name);
    } else {
      results.xyz_meta_body = await res.text();
    }
  } catch (err) {
    results.xyz_meta_error = String(err);
  }

  // 4. Try allMids to see if xyz: prefixed coins appear
  try {
    const res = await fetch(INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' }),
    });
    results.allMids_status = res.status;
    if (res.ok) {
      const data = await res.json();
      const allKeys = Object.keys(data);
      results.allMids_total = allKeys.length;
      // Find colon-containing keys (builder perps)
      const colonKeys = allKeys.filter(k => k.includes(':'));
      results.allMids_colon_keys = colonKeys.slice(0, 30);
      results.allMids_colon_count = colonKeys.length;
      // Check for specific symbols
      results.allMids_has_TSLA = 'TSLA' in data;
      results.allMids_has_xyz_TSLA = 'xyz:TSLA' in data;
      results.allMids_has_BTC = 'BTC' in data;
    } else {
      results.allMids_body = await res.text();
    }
  } catch (err) {
    results.allMids_error = String(err);
  }

  return NextResponse.json(results, { status: 200 });
}
