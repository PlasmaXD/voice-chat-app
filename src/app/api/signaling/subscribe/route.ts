// app/api/signaling/subscribe/route.ts

// Edge Runtime で動作させるための設定
export const config = { runtime: 'edge' };

// Edge 環境では、@upstash/redis/edge をインポートする
import { Redis } from '@upstash/redis/edge';

// Upstash Redis クライアントの初期化（接続は自動で HTTP リクエストベースで行われる）
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl || !redisToken) {
  throw new Error("Missing Upstash Redis configuration in environment variables.");
}

const redis = new Redis({
  url: redisUrl,
  token: redisToken,
});

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  if (!clientId) {
    return new Response('Missing clientId', { status: 400 });
  }

  const channel = `messages:${clientId}`;
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*', // 必要に応じてCORS設定
  };

  let cancelled = false;
  let interval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Redis Pub/Sub を利用したメッセージ配信
        const subscriber = redis.duplicate();
        await subscriber.subscribe(channel, (message) => {
          controller.enqueue(`data: ${message}\n\n`);
        });

        // 接続維持用の定期 ping
        interval = setInterval(() => {
          try {
            controller.enqueue(`data: ping\n\n`);
          } catch (error) {
            console.error("Error enqueuing ping:", error);
          }
        }, 20000);
      } catch (error) {
        console.error("Error starting stream:", error);
        controller.enqueue(`data: error\n\n`);
      }
    },
    async cancel() {
      cancelled = true;
      if (interval) {
        clearInterval(interval);
      }
      // クリーンアップ処理
      console.log("Stream cancelled");
    },
  });

  return new Response(stream, { headers });
}
