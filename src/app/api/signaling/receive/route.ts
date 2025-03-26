// app/api/signaling/receive/route.ts
import { NextResponse } from "next/server";
import { createClient } from "redis";

// Redisクライアントの初期化（REDIS_URLは.env.localで設定）
const redisClient = createClient({
  url: process.env.REDIS_URL
});
await redisClient.connect();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }
  // 指定クライアント用のメッセージリストから全件取得
  const messages = await redisClient.lRange(`messages_queue:${clientId}`, 0, -1);
  // 取得後、リストを削除
  await redisClient.del(`messages_queue:${clientId}`);
  const parsedMessages = messages.map((msg) => JSON.parse(msg));
  return NextResponse.json({ messages: parsedMessages });
}
