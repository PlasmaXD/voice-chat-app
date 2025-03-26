// app/api/signaling/subscribe/route.ts
import { NextResponse } from 'next/server';
import { createClient } from 'redis';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  if (!clientId) {
    return new NextResponse('Missing clientId', { status: 400 });
  }

  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };

  // 外部変数としてクリーンアップ対象を定義
  let interval: NodeJS.Timeout | null = null;
  let subscriber: ReturnType<typeof createClient> | null = null;
  let redis: ReturnType<typeof createClient> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      // Redisクライアントの初期化
      redis = createClient({ url: process.env.REDIS_URL });
      await redis.connect();
      // サブスクライバー用にクライアントを複製
      subscriber = redis.duplicate();
      await subscriber.connect();

      const channel = `messages:${clientId}`;
      // Redis の PubSub チャンネルに subscribe
      await subscriber.subscribe(channel, (message) => {
        try {
          controller.enqueue(`data: ${message}\n\n`);
        } catch (err) {
          console.error("Error enqueuing message:", err);
        }
      });

      // 定期的に ping を送信して接続を維持
      interval = setInterval(() => {
        // controller.desiredSize が null でなければ enqueued
        if (controller.desiredSize !== null) {
          try {
            controller.enqueue(`data: ping\n\n`);
          } catch (err) {
            console.error("Error enqueuing ping:", err);
          }
        }
      }, 20000);
    },
    async cancel() {
      if (interval) {
        clearInterval(interval);
      }
      if (subscriber) {
        try {
          await subscriber.unsubscribe(`messages:${clientId}`);
          await subscriber.disconnect();
        } catch (err) {
          console.error("Error during subscriber cleanup:", err);
        }
      }
      if (redis) {
        try {
          await redis.disconnect();
        } catch (err) {
          console.error("Error during redis cleanup:", err);
        }
      }
    },
  });

  return new Response(stream, { headers });
}
