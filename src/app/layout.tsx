
import "./globals.css";



export const metadata = {
  title: 'Voice Call App',
  description: 'A voice call app using Next.js, WebRTC, and Redis Signaling',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
