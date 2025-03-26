// app/page.tsx
import Link from 'next/link';

export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Voice Call App</h1>
      <Link href="/call" className="text-blue-500 underline">
        通話ページへ
      </Link>
    </main>
  );
}
