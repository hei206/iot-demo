/**
 * Express 服务器 —— 托管前端静态文件 + 暴露 publisher.js 的数据接口
 *
 * 数据链路：
 *   publisher.js (MQTT 发布 + 环形缓冲区)
 *        ↓ require（同进程内调用）
 *   server.js (REST API)
 *        ↓ HTTP
 *   index.html + app.js (浏览器)
 */

const express = require('express');
const path = require('path');

// require publisher：其顶层代码会立即执行 MQTT connect + setInterval
// MQTT publish 功能正常运行，同时数据被写入 dataBuffer
const publisher = require('./publisher');

const app = express();
const PORT = process.env.PORT || 3000;

// 静态托管当前目录（index.html / app.js / style.css 等）
app.use(express.static(path.join(__dirname)));

// ==== API 端点 ====

// GET /api/current —— 最新一条数据
app.get('/api/current', (req, res) => {
  const item = publisher.getCurrent();
  if (!item) {
    return res.json({ ok: false, msg: '暂无数据' });
  }
  res.json({ ok: true, data: item });
});

// GET /api/history?n=30 —— 最近 n 条历史
app.get('/api/history', (req, res) => {
  const n = parseInt(req.query.n, 10) || 30;
  const list = publisher.getHistory(n);
  res.json({ ok: true, data: list });
});

// GET /api/control?action=reset —— 控制 publisher
app.get('/api/control', (req, res) => {
  const action = req.query.action;
  if (action === 'reset') {
    publisher.reset();
    return res.json({ ok: true });
  }
  res.json({ ok: false, msg: `未知 action: ${action}` });
});

// ==== 启动 ====
app.listen(PORT, () => {
  console.log(`\n🚀 Express 服务已启动 → http://localhost:${PORT}`);
  console.log(`📊 API 预览：GET /api/current  /  /api/history?n=30`);
});
