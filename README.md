# 珠宝外贸工作台

给珠宝外贸业务员用的 Electron 工作台。每日记录、回复话术、回复习惯存在本机；客户从云端 CRM 读取。工作台打开时在 `127.0.0.1` 提供 MCP，Cursor 里的 AI 读写同一份数据。

```sh
npm install
npm run dev
```

关掉窗口后程序留在托盘里，提醒才会继续。设置页可以复制 Cursor 的 MCP 配置。
