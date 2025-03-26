// app/api/signaling/send/route.ts
import { NextResponse } from "next/server";
import { createClient } from "redis";

// Redisクライアントの初期化（REDIS_URLは.env.localで設定）
const redisClient = createClient({
  url: process.env.REDIS_URL
});
await redisClient.connect();

export async function POST(request: Request) {
  const { event, data, targetId } = await request.json();
  const message = JSON.stringify({ event, data });
  // Redis PubSub による送信
  await redisClient.publish(`messages:${targetId}`, message);
  // 受信用ポーリング用にリストにも追加（最新メッセージとして保存）
  await redisClient.lPush(`messages_queue:${targetId}`, message);
  return NextResponse.json({ status: "sent" });
}
