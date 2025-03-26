// app/call/page.tsx
import VoiceCall from './components/VoiceCall';

export default function CallPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">Voice Call</h1>
      <VoiceCall />
    </main>
  );
}
