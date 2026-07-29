// ShotLingua 動的OG Worker
//
// 目的: LINE/Instagram 等のリンクプレビューの「見出し」を、共有ごとに
//   交流ルーム名 / 投稿名(本文) に動的置換する(Claudeのシェアと同じ見え方)。
//   画像(og:image)はアプリアイコンのまま。
//
// 仕組み: shotlingua.app/share.html?id=... へのリクエストを Worker が受け、
//   GitHub Pages の静的 share.html を取得 → shares/{id} スナップショットを Firestore から読み
//   → HTMLRewriter で <title> / og:title / og:description を書き換えて返す。
//   ブラウザには従来通りの share.html(JSで会話描画) がそのまま届く。クローラは動的OGを読む。
//
// ⚠ ルート: shotlingua.app/share.html (要 Cloudflare プロキシON = オレンジクラウド)。

const FIREBASE_KEY = "AIzaSyAodG25aOXTOfwsn0X1RsgHliJ7u0TOhBo"; // web APIキー(公開情報)
const PROJECT = "shotlingua-12";
// ループ回避のため origin は GitHub Pages を直接叩く(shotlingua.app ではなく)。
const ORIGIN = "https://waytogo-ta.github.io/-shotlingua-site";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const id = (url.searchParams.get("id") || "").trim();

    // 静的ページを origin から取得。
    const originResp = await fetch(ORIGIN + url.pathname + url.search, {
      cf: { cacheTtl: 60, cacheEverything: true },
    });
    const ct = originResp.headers.get("content-type") || "";
    // share.html 以外 / id 無し / 非HTML はそのまま返す。
    if (!id || !url.pathname.endsWith("/share.html") || !ct.includes("text/html")) {
      return originResp;
    }

    // スナップショットから見出し・説明を作る。失敗時は既定文言。
    let title = "ShotLingua で話題";
    let desc = "匿名で相談・交流できるアプリ ShotLingua。続きはアプリで読めます。";
    try {
      const r = await fetch(
        `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/shares/${encodeURIComponent(id)}?key=${FIREBASE_KEY}`
      );
      if (r.ok) {
        const f = (await r.json()).fields || {};
        const type = f.type && f.type.stringValue;
        if (type === "room_thread") {
          const room = (f.roomName && f.roomName.stringValue) || "相談";
          title = room; // 見出し = ルーム名(チャット名)
          const msgs = (f.messages && f.messages.arrayValue && f.messages.arrayValue.values) || [];
          const opText = msgs[0] && msgs[0].mapValue && msgs[0].mapValue.fields
            && msgs[0].mapValue.fields.text && msgs[0].mapValue.fields.text.stringValue;
          desc = opText ? clip(opText, 90) : desc;
        } else if (type === "post") {
          const author = (f.authorLabel && f.authorLabel.stringValue) || "";
          const text = (f.text && f.text.stringValue) || "";
          title = text ? clip(text, 42) : (author ? author + " の投稿" : "みんなの投稿");
          desc = author ? author + " · ShotLingua" : desc;
        }
      }
    } catch (_) {}

    // og:image はアプリアイコンのまま(触らない)。<title>/og:title/og:description のみ差し替え。
    return new HTMLRewriter()
      .on('meta[property="og:title"]',        { element(e){ e.setAttribute("content", title); } })
      .on('meta[property="og:description"]',  { element(e){ e.setAttribute("content", desc); } })
      .on('meta[name="twitter:title"]',       { element(e){ e.setAttribute("content", title); } })
      .on('title', { element(e){ e.setInnerContent(title + " · ShotLingua"); } })
      .transform(originResp);
  },
};

function clip(s, n) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
}
