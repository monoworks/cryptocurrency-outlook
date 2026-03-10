import { NextRequest, NextResponse } from 'next/server';

export const preferredRegion = 'hnd1';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, apiKey, model, prompt, imageBase64 } = body as {
      provider: 'openai' | 'anthropic';
      apiKey: string;
      model: string;
      prompt: string;
      imageBase64?: string;
    };

    if (!apiKey || !prompt) {
      return NextResponse.json({ error: 'apiKey と prompt が必要です' }, { status: 400 });
    }

    if (provider === 'openai') {
      return handleOpenAI(apiKey, model || 'gpt-4o', prompt, imageBase64);
    } else if (provider === 'anthropic') {
      return handleAnthropic(apiKey, model || 'claude-sonnet-4-20250514', prompt, imageBase64);
    }

    return NextResponse.json({ error: 'provider は openai または anthropic を指定してください' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleOpenAI(apiKey: string, model: string, prompt: string, imageBase64?: string) {
  type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
  const content: ContentPart[] = [{ type: 'text', text: prompt }];

  if (imageBase64) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${imageBase64}` },
    });
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `OpenAI API error: ${err}` }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json({ result: data.choices[0].message.content });
}

async function handleAnthropic(apiKey: string, model: string, prompt: string, imageBase64?: string) {
  type ContentBlock = { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };
  const content: ContentBlock[] = [];

  if (imageBase64) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: imageBase64 },
    });
  }
  content.push({ type: 'text', text: prompt });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Anthropic API error: ${err}` }, { status: res.status });
  }

  const data = await res.json();
  const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '';
  return NextResponse.json({ result: text });
}
