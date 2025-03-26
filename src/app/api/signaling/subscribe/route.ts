// app/api/signaling/subscribe/route.ts

// Edge Runtime で動作させるための設定
export const config = { runtime: 'edge' };

// Edge 環境では、@upstash/redis/edge をインポートする
import { Redis } from '@upstash/redis/with-fetch';


// Upstash Redis クライアントの初期化（接続は自動で HTTP リクエストベースで行われる）
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  if (!clientId) {
    return new Response('Missing clientId', { status: 400 });
  }
  const channel = `messages:${clientId}`;
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };

  let cancelled = false;
  let interval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      // ポーリングループ：Redis リストからメッセージを取得して SSE 経由で送信
      async function pollMessages() {
        while (!cancelled) {
          try {
            const message = await redis.lpop(channel);
            if (message !== null) {
              controller.enqueue(`data: ${message}\n\n`);
            } else {
              // メッセージがなければ 1 秒待機
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          } catch (error) {
            console.error("Error polling messages:", error);
            controller.enqueue(`data: error\n\n`);
            break;
          }
        }
      }
      pollMessages();

      // 接続維持用の定期 ping
      interval = setInterval(() => {
        try {
          controller.enqueue(`data: ping\n\n`);
        } catch (error) {
          console.error("Error enqueuing ping:", error);
        }
      }, 20000);
    },
    async cancel() {
      cancelled = true;
      if (interval) {
        clearInterval(interval);
      }
      // 追加のクリーンアップ処理があればここに記述
    },
  });

  return new Response(stream, { headers });
}
