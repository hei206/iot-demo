# Express + Publisher + 可视化网页实施计划

## 仓库调研

### 已有文件

| 文件 | 内容 | 状态 |
|------|------|------|
| `package.json` | name=iot-demo, main=publisher.js, 依赖 `mqtt ^5.0` + `express ^4.18.2` | 已存在，**修正 mqtt 版本号的笔误**（当前写的是 `^5..0`，有两个点） |
| `publisher.js` | MQTT 发布端，连 `broker.emqx.io:1883`，主题 `/iot/sensor/temphumi`，**每 1 秒**发布 `{ temperature, humidity, time }`，字段全拼 | 已存在，**保留不动** |
| `index.html` | 前端页面，双卡片 + 折线图 + 控制面板（开始/暂停/清空/间隔调整） | 已存在，**微调** |
| `style.css` | 深色科技风样式 | 已存在，**不动** |
| `app.js` | 前端 JS，**内置自模拟数据生成器**（正弦+随机游走，和 publisher 无关） | 已存在，**重写** |

### 字段命名
- publisher.js 发的 MQTT payload：`{ temperature, humidity, time }`（全拼）
- 现有 app.js 内部变量：`temp`, `humi`（缩写）
- **统一用 publisher 的字段名**：前端改适配后端返回的字段

---

## 总体架构

```
┌──────────────────────────────────────────────────┐
│  Node.js 进程                                     │
│                                                    │
│  server.js (Express, 端口 3000)                    │
│    ├── 静态托管 (index.html / app.js / style.css) │
│    ├── /api/current    ── 返回最新一条数据         │
│    ├── /api/history?n=30 ── 返回最近 n 条历史     │
│    ├── /api/control?action=reset ── 重置历史      │
│    │                                               │
│    └── 内部持有 publisher 模块产出的数据环形缓冲    │
│                                                    │
│  publisher.js (被 server.js require)               │
│    ├── MQTT 连接 + 定时 publish（原有功能保留）     │
│    └── 数据同时喂给 server.js 的 API（新增）        │
│                                                    │
└──────────────────────────────────────────────────┘
        ▲ REST 轮询
        │
   index.html + app.js (浏览器)
```

**设计决策：Express 和 publisher 在同一个 Node 进程里跑。**

publisher.js 需要做的改动**极小**：在定时 publish 的同一个 `setInterval` 里，每次生成数据后多做一件事——调用一个注册回调，把数据同时塞给 Express。MQTT publish 那部分**一行不改**。

---

## 要改/新建的文件（按顺序）

| 操作 | 文件 | 改动内容 |
|------|------|----------|
| **修改** | `package.json` | ① mqtt 版本 `^5..0` → `^5.10.1`（修正笔误）② main 改为 `server.js` ③ 加启动脚本 `"start": "node server.js"` |
| **修改** | `publisher.js` | **新增导出接口**（MQTT publish 逻辑原封不动）：① 生成一个环形缓冲区 `dataBuffer[]`（保留 60 条）② 每 publish 一条的同时 push 进 buffer ③ 新增 `module.exports = { getCurrent, getHistory, reset }` 供 server.js 调用 |
| **新建** | `server.js` | Express 主服务：静态托管 + 3 个 API 端点。启动时 require publisher，publisher 里的 setInterval 自动开始跑 |
| **重写** | `app.js` | 删掉前端自生成逻辑，改成：① 加载时 `fetch('/api/history')` 填充初始曲线 ② `setInterval` 每秒 `fetch('/api/current')` 追加 ③ 字段名适配 temperature/humidity ④ "等待数据"状态处理 ⑤ 控制面板按钮改为调 `/api/control` |
| **微调** | `index.html` | 控制面板：移除"开始/暂停/间隔调整"（因为 publisher 固定 1 秒推送，前端无法控制节奏），保留"清空"按钮；状态栏改为显示 API 连接状态（"已连接"/"等待数据"） |
| **不动** | `style.css` | 保持原样 |
| **不动** | `.gitignore` | 已包含 node_modules/ |

---

## publisher.js 改动细节（最小侵入）

原 publisher.js 里这段（第 20~38 行）：

```js
setInterval(() => {
  const temp = parseFloat((20 + Math.random() * 10).toFixed(1));
  const humi = parseFloat((40 + Math.random() * 30).toFixed(1));
  const data = {
    temperature: temp,
    humidity: humi,
    time: new Date().toLocaleTimeString()
  };
  const payload = JSON.stringify(data);
  client.publish(topic, payload, { qos: 0 }, (err) => { ... });
}, 1000);
```

**只额外加两行**：

```js
// 环形缓冲区（新增）
const dataBuffer = [];
const MAX_BUFFER = 60;

// 在 setInterval 里，data 对象创建后、publish 之前，加：
dataBuffer.push(data);
if (dataBuffer.length > MAX_BUFFER) dataBuffer.shift();

// 文件末尾新增导出：
module.exports = {
  getCurrent: () => dataBuffer[dataBuffer.length - 1] || null,
  getHistory: (n = MAX_BUFFER) => dataBuffer.slice(-n),
  reset: () => dataBuffer.length = 0
};
```

**MQTT 连接和 publish 的原有逻辑完全不动**。

---

## Express API 设计

| 端点 | 方法 | 响应 | 说明 |
|------|------|------|------|
| `/` | GET | index.html | 页面入口 |
| `/app.js` / `/style.css` | GET | 静态文件 | Express.static 托管 |
| `/api/current` | GET | `{ ok: true, data: { temperature, humidity, time } }` 或 `{ ok: false, msg: '暂无数据' }` | 最新一条 |
| `/api/history?n=30` | GET | `{ ok: true, data: [...] }` | 最近 n 条历史 |
| `/api/control?action=reset` | GET | `{ ok: true }` | 清空缓冲区 |

---

## app.js 改造要点

```
页面加载：
  1. fetch('/api/history?n=30') → 有数据则填充曲线，无数据则显示"等待数据"
  2. setInterval(pollCurrent, 1000)  // 每秒拉一次（和 publisher 1 秒节奏对齐）

pollCurrent():
  fetch('/api/current')
    → 有新数据（和上次不同 time）：push 进数组、chart.update('none')
    → 无数据：显示"等待数据"

清空按钮 → fetch('/api/control?action=reset') → 前端也清空数组并 chart.update()
```

**关键点：前端不再自己生成任何数据**，全部来自 publisher.js 生成的数据，通过 Express REST API 透出。

---

## 依赖

package.json 修正后：
```jsonc
{
  "dependencies": {
    "mqtt": "^5.10.1",   // 原 ^5..0 笔误修正
    "express": "^4.18.2" // 保持不变
  }
}
```
Chart.js 继续走 CDN（index.html 已引入），不进 npm。

---

## 启动步骤

```powershell
cd D:\Projects\iot-demo
npm install     # 装 mqtt + express
npm start       # 即 node server.js
                # 控制台应打印：
                #   ✅ MQTT 连接成功，开始定时发布温湿度数据
                #   ✅ Express 服务已启动 → http://localhost:3000
```

打开浏览器访问 http://localhost:3000

---

## 验证清单

| # | 检查项 | 预期 |
|---|--------|------|
| 1 | `npm install` 无报错 | mqtt + express 成功安装 |
| 2 | `npm start` 控制台 | MQTT 连接成功 + Express 启动 |
| 3 | 页面能打开 | http://localhost:3000 正常渲染 |
| 4 | 初始曲线 | `/api/history` 返回数据，图表有 30 个初始点 |
| 5 | 自动更新 | 曲线每 1 秒增长一个新点（与 publisher 节奏一致） |
| 6 | 数据源唯一 | 浏览器 console 打印的最新数值 === MQTT publish 控制台日志 === `curl /api/current` 返回值 |
| 7 | 清空按钮 | 点击后图表归零，刷新页面后曲线从当前 publisher 运行状态重新填充 |
| 8 | 刷新页面 | 能从 `/api/history` 恢复最近曲线，每秒继续追加 |
| 9 | MQTT 独立运行 | 即使不启动 Express，publisher.js 单独跑 `node publisher.js` 也能正常 publish（原有功能保留） |

---

## 风险与处理

| 风险 | 影响 | 处理 |
|------|------|------|
| MQTT broker.emqx.io 连不上（网络问题） | publisher 数据无法生成，前端一直"等待数据" | publisher 的 MQTT connect 失败时也用 `Math.random()` 兜底生成数据塞进 buffer（不影响 publish，只是前端依然能展示）；或者让 publisher 在 connect error 后降级为"纯本地模拟模式" |
| 两个启动入口 | 原 package.json main=publisher.js，改成 main=server.js 后，用户 `node publisher.js` 依然能单独跑（publish 正常，但没有 Express API） | 保留 publisher.js 的独立运行能力；server.js 不启动 publisher 的 MQTT，而是 require publisher.js 让它自己跑（因为 publisher.js 顶层代码自动执行 setInterval） |
| Windows Node 版本过低 | mqtt 5.x 需要 Node ≥ 16 | Express 4.18 同样需要 Node ≥ 14，当前环境应该没问题；启动时加版本检查 |
