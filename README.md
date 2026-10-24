# 勝負服暗記帳

中央競馬（JRA）の主な馬主の勝負服を覚える Web アプリ。[ダービー馬暗記帳](https://tetsuogi.github.io/derby-quiz/) の姉妹アプリ。

勝負服は画像を持たず、服色の表記（例：「黒、赤十字襷、袖黄縦縞」）から `silks.js` が SVG で描く。

| ファイル | 内容 |
|---|---|
| `silks.js` | 表記の読み取りと描画 |
| `data.js` | 馬主70人分（服色・冠名・2011年以降のJRA平地GI勝利） |
| `app.js` / `style.css` | アプリ本体・見た目 |
| `supabase/schema.sql` | 進捗テーブル |

更新時は `index.html` の `?v=…` を新しくする。

データ出典：Wikipedia 日本語版の各記事（CC BY-SA 4.0）
