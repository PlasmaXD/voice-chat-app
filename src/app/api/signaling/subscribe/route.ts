// app/api/signaling/subscribe/route.ts

// Edge Runtime で動作させるための設定
export const config = { runtime: 'edge' };

import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl || !redisToken) {
  throw new Error("Missing Upstash Redis configuration in environment variables.");
}

// Upstash Redis クライアントを初期化
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
  };

  let interval: ReturnType<typeof setInterval> | null = null;

  // SSE 用の ReadableStream を構築
  const stream = new ReadableStream({
    async start(controller) {
      // ❶ Pub/Subのサブスクライブか、あるいはリストへの書き込みをポーリングするか
      //    (※現在 Upstash Redis でのPubSubサポートやEdge対応はバージョン・プラン等に依存)
      try {
        // 例) Redisリストをポーリング
        async function pollMessages() {
          while (true) {
            try {
              const message = await redis.lpop(channel);
              if (message) {
                controller.enqueue(`data: ${message}\n\n`);
              } else {
                // メッセージが無ければ 1秒待機
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }
            } catch (err) {
              console.error("Error polling messages:", err);
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
      } catch (error) {
        console.error("Error starting SSE stream:", error);
        controller.enqueue(`data: error\n\n`);
      }
    },
    async cancel() {
      // クライアントが SSE 接続を閉じたときのクリーンアップ
      if (interval) {
        clearInterval(interval);
      }
      console.log("SSE stream cancelled");
    },
  });

  return new Response(stream, { headers });
}
