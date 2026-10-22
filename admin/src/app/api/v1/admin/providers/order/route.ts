// admin/src/app/api/v1/admin/providers/order/route.ts
// GET/PUT API for the provider ordering.
//
// The API owns the canonical order: it persists `providersOrder.json` and
// re-sorts the running provider manager. When the API cannot be reached the
// file is updated directly so the order is never lost.

import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const orderFile = process.env.PROVIDERS_ORDER_FILE
  ? path.resolve(process.env.PROVIDERS_ORDER_FILE)
  : path.resolve(process.cwd(), 'providersOrder.json');

function apiBase(): string {
  return (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

async function readOrder(): Promise<string[]> {
  try {
    const data = await fs.readFile(orderFile, 'utf-8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

async function writeOrder(order: string[]): Promise<void> {
  await fs.writeFile(orderFile, `${JSON.stringify(order, null, 2)}\n`, 'utf-8');
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function GET(request: NextRequest) {
  try {
    const upstream = await fetch(`${apiBase()}/api/v1/admin/providers/order`, {
      headers: { cookie: request.headers.get('cookie') ?? '' },
      cache: 'no-store',
    });
    if (upstream.ok) {
      const data = (await upstream.json()) as { order?: string[] };
      if (Array.isArray(data.order)) return json({ order: data.order });
    }
  } catch {
    // fall back to the local file
  }
  return json({ order: await readOrder() });
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body must be an array of provider ids' }, 400);
  }

  const order = Array.isArray(body)
    ? body.filter((value): value is string => typeof value === 'string')
    : Array.isArray((body as { order?: unknown })?.order)
      ? ((body as { order: unknown[] }).order.filter(
          (value): value is string => typeof value === 'string',
        ))
      : null;

  if (!order) return json({ error: 'Body must be an array of provider ids' }, 400);

  try {
    const upstream = await fetch(`${apiBase()}/api/v1/admin/providers/order`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: request.headers.get('cookie') ?? '',
      },
      body: JSON.stringify({ order }),
      cache: 'no-store',
    });
    if (upstream.ok) {
      const data = (await upstream.json()) as { order?: string[] };
      return json({ success: true, order: data.order ?? order });
    }
  } catch {
    // fall back to writing the file
  }

  try {
    await writeOrder(order);
    return json({ success: true, order });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
}
