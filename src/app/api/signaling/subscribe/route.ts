// app/api/signaling/subscribe/route.ts

// Edge Runtime で動作させるための設定
export const config = { runtime: 'edge' };

import { Redis } from '@upstash/redis';

// Upstash Redis クライアントの初期化
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
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

  const stream = new ReadableStream({
    async start(controller) {
      let cancelled = false;

      // 定期的に Redis リストからメッセージをポーリングする関数
      async function pollMessages() {
        while (!cancelled) {
          try {
            // チャンネル（Redis リスト）からメッセージを取得
            const message = await redis.lpop(channel);
            if (message !== null) {
              controller.enqueue(`data: ${message}\n\n`);
            } else {
              // メッセージがなければ1秒待機
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
      const interval = setInterval(() => {
        try {
          controller.enqueue(`data: ping\n\n`);
        } catch (error) {
          console.error("Error enqueuing ping:", error);
        }
      }, 20000);

      // ストリームが閉じられたときのクリーンアップ
      controller.closed.catch(() => {
        cancelled = true;
        clearInterval(interval);
      });
    },
    cancel() {
      // 追加のクリーンアップ処理が必要ならここで実施
    },
  });

  return new Response(stream, { headers });
}
