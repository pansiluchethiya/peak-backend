import { Player } from '@/components/Player';

export const dynamic = 'force-dynamic';

function apiBase(): string {
  return process.env.PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3000';
}

export default async function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Player apiBase={apiBase()} media={{ type: 'movie', id }} />;
}
