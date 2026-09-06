# 梦之韵模组包发布系统 · API 指南

本 Worker 部署于 Cloudflare Workers，对外提供「模组包发布 / 版本检测 / 工单系统 / 错误报告分析」四大能力。

- **生产域名**：`https://releases.camzy.uno`
- **Workers 直连域名**：`https://modpack-release.catkinr-93f.workers.dev`（与生产域名行为一致，主要用于调试）
- 所有接口返回 `application/json; charset=utf-8`（OAuth 跳转与静态资源除外）
- 成功响应统一为 `{ "ok": true, ... }`；失败响应统一为 `{ "error": "<原因>" }`

---

## 1. 认证方式

系统支持三种身份：

| 身份 | 说明 | 获取方式 |
|---|---|---|
| 匿名 | 可访问公开接口 | 无需认证 |
| 管理员会话 | 通过 Cookie 会话（`mp_session`）识别 | 账号密码登录或 **SSO 统一登录**（sso.camzy.uno） |
| API Token | 通过 `Authorization: Bearer mz_xxx` 请求头识别 | 超级管理员在管理后台生成 |

### 1.1 管理员会话

- 登录成功后服务端通过 `Set-Cookie` 下发会话 Cookie（键名 `mp_session`），后续请求携带该 Cookie 即视为已登录。
- 会话有效期由 `SESSION_TTL_HOURS` 控制（默认 168 小时）。
- 角色：`super`（超级管理员）/ `admin`（管理员）。

### 1.2 API Token

- 格式：`mz_` 开头 + 60 位十六进制随机串。
- 用法：`Authorization: Bearer mz_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- 仅对标注为「管理员 或 Token」的接口生效；标注「仅管理员会话」的接口不接受 Token。
- Token 管理见 [6.4 API Token 管理](#64-api-token-管理)。

### 1.3 认证级别速查

| 级别 | 判定 |
|---|---|
| 公开 | 无需认证 |
| 管理员 或 Token | 会话是 super/admin，**或** Bearer 为有效 API Token |
| 仅管理员会话 | 会话是 super/admin（Token 无效） |
| 仅超级管理员 | 会话是 super |

---

## 2. 公共接口（无需认证）

### 2.1 模组列表

```
GET /api/mods
```

返回当前模组包内所有模组（从 GitHub 仓库读取）。

响应示例：

```json
{
  "mods": [
    { "name": "create-1.21.1-6.0.10.jar", "size": 19127040, "mtime": "2026-09-05T08:57:21Z" }
  ]
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `mods[].name` | string | 模组文件名 |
| `mods[].size` | number | 字节大小 |
| `mods[].mtime` | string | 最后修改时间 |

### 2.2 镜像列表

```
GET /api/mirrors
GET /api/mirrors?test=1
```

返回模组包 zip 的下载镜像地址。`?test=1` 时会对每个镜像做连通性测试，额外返回 `ok` / `error` / `latencyMs` 字段。

响应示例：

```json
{
  "mirrors": [
    { "name": "GitHub", "url": "https://github.com/maoxinhe/modpack/releases/latest/download/modpack.zip" }
  ]
}
```

### 2.3 最新版本（启动器版本检测）

```
GET /api/releases/latest
```

从 GitHub Releases API（携带 `GITHUB_TOKEN`）读取最新发布，同时返回本地缓存的发布状态。**这是客户端（启动器）检测新版本的推荐接口。**

响应示例：

```json
{
  "release": {
    "tag_name": "v1.0.10",
    "name": "梦之韵模组包 v1.0.10",
    "published_at": "2026-09-05T08:57:16Z",
    "html_url": "https://github.com/maoxinhe/modpack/releases/tag/v1.0.10",
    "body": "## 梦之韵模组包 v1.0.10\n\n共 40 个模组：...",
    "assets": [
      { "name": "modpack.zip", "browser_download_url": "https://github.com/maoxinhe/modpack/releases/download/v1.0.10/modpack.zip", "size": 69996671 }
    ]
  },
  "state": {
    "currentVersion": "1.0.10",
    "lastPublishAt": "2026-09-05T08:57:21.957Z",
    "lastReleaseId": 383191859,
    "lastReleaseTag": "v1.0.10"
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `release` | object \| null | 最新发布；无发布时为 `null` |
| `release.assets[].browser_download_url` | string | 直接下载地址（模组包 zip / 更新器 exe） |
| `state.currentVersion` | string | 本地缓存的最新版本号（不带 `v` 前缀） |

### 2.4 版本列表

```
GET /api/releases
```

响应示例：

```json
{
  "releases": [
    {
      "id": 383191859,
      "tag": "v1.0.10",
      "name": "梦之韵模组包 v1.0.10",
      "published_at": "2026-09-05T08:57:16Z",
      "html_url": "https://github.com/maoxinhe/modpack/releases/tag/v1.0.10",
      "assets": [
        { "name": "modpack.zip", "url": "https://github.com/maoxinhe/modpack/releases/download/v1.0.10/modpack.zip", "size": 69996671 }
      ]
    }
  ]
}
```

### 2.5 版本详情

```
GET /api/releases/{id}
```

`{id}` 为 GitHub Release 数字 ID。响应较列表多返回 `body`、每个资产的 `download_count`。

### 2.6 工单：查询官方邮箱

```
GET /api/ticket-info
```

返回工单系统官方发件邮箱列表（用于客户端提示"邮件来自哪个地址"）。

```json
{ "official": ["noreply@camzy.uno"] }
```

### 2.7 工单：提交（第一步，获取邮箱验证码）

```
POST /api/tickets
Content-Type: application/json
```

请求体：

```json
{
  "nickname": "玩家昵称",
  "gamename": "梦之韵",
  "email": "player@example.com",
  "content": "加载世界时崩溃"
}
```

| 字段 | 限制 |
|---|---|
| `nickname` | 必填，≤ 20 字符 |
| `gamename` | 必填，≤ 40 字符 |
| `email` | 必填，合法邮箱格式 |
| `content` | 必填，≤ 5000 字符 |

行为：向 `email` 发送 6 位验证码（10 分钟内有效），返回：

```json
{ "ok": true, "message": "验证码已发送到 player@example.com，请在 10 分钟内填写" }
```

### 2.8 工单：验证并创建（第二步）

```
POST /api/tickets/verify
Content-Type: application/json
```

请求体：

```json
{ "email": "player@example.com", "code": "123456" }
```

验证码正确后创建工单，**并触发 AI 自动处理**（根据 wiki 知识库尝试自动回复，判断不充分则保持人工处理）。

响应示例：

```json
{ "ok": true, "id": "T20260906-143025123", "message": "工单提交成功" }
```

工单 ID 格式：`T<年月日>-<时分秒><3位随机>`。

工单状态机：`new`（待处理）→ `replied`（已回复）→ `closed`（已关闭）；AI 判定自动回复成立时标记为 `auto`。玩家追加留言时 `auto`/`closed` 会重新变为 `new`。

### 2.9 工单：查询进度

```
GET /api/tickets/{id}?email=player@example.com
```

以提交工单时的邮箱作为凭证查询（邮箱不匹配返回 403）。

响应示例：

```json
{
  "ticket": {
    "id": "T20260906-143025123",
    "gamename": "梦之韵",
    "status": "replied",
    "createdAt": "2026-09-06T06:30:25.000Z",
    "content": "加载世界时崩溃",
    "replies": [
      { "from": "admin", "content": "请提供崩溃日志", "at": "2026-09-06T07:00:00.000Z" }
    ]
  }
}
```

| 字段 | 说明 |
|---|---|
| `ticket.status` | `new` / `replied` / `closed` / `auto` |
| `ticket.replies[].from` | `admin` 或 `user` |

### 2.10 工单：追加留言

```
POST /api/tickets/{id}/message
Content-Type: application/json
```

请求体：

```json
{ "email": "player@example.com", "content": "补充：我用的 Java 21" }
```

校验逻辑同查询接口（邮箱必须匹配）。成功后通知管理员收件邮箱（见 [6.3 通知邮箱管理](#63-通知邮箱管理)）。

### 2.11 当前用户信息

```
GET /api/me
```

携带会话 Cookie 时返回登录信息，否则返回 `user: null`。

响应示例：

```json
{
  "user": {
    "login": "maoxinhe",
    "name": "maoxinhe",
    "role": "super",
    "avatar_url": "https://...",
    "oauth": { "qq": { "uid": "...", "nickname": "...", "faceimg": "...", "boundAt": "..." } }
  },
  "isAdmin": true,
  "isSuper": true
}
```

### 2.12 账号密码登录

```
POST /api/auth/login
Content-Type: application/json
```

请求体：

```json
{ "username": "maoxinhe", "password": "********" }
```

- 成功：`Set-Cookie` 写入会话，返回 `{ "ok": true, "user": { "login", "name", "role" } }`
- 失败：`401 { "error": "账号或密码错误" }`
- 同一账号+IP 连续失败 8 次后锁定 10 分钟：`429`

### 2.13 错误报告：发送邮箱验证码

```
POST /api/error-reports/verify
Content-Type: application/json
```

请求体：

```json
{ "email": "player@example.com", "nickname": "玩家昵称" }
```

限流策略：

| 维度 | 默认限制 | 窗口 |
|---|---|---|
| 同一 IP | 5 次 | 1 小时 |
| 同一邮箱 | 5 次 | 1 小时 |
| 同一邮箱冷却 | 1 次 | 1 分钟 |

被限流时返回 `429`，并带 `retry_after` 与 `Retry-After` 头。

### 2.14 错误报告：绑定用户 ID 与邮箱

```
POST /api/error-reports/bind
Content-Type: application/json
```

请求体：

```json
{ "id": "客户端随机生成的用户ID", "email": "player@example.com", "code": "123456" }
```

验证码通过后，将该用户 ID 与邮箱绑定（默认 30 天有效），之后上传时携带 `id` 字段即可免验证码。

响应示例：

```json
{ "ok": true, "id": "abc123", "email": "player@example.com", "message": "邮箱验证成功，已绑定", "ttl_days": 30 }
```

### 2.15 错误报告：上传（multipart/form-data）

```
POST /api/error-reports
Content-Type: multipart/form-data
```

表单字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| `file` | 是 | 崩溃日志 zip（仅 `.zip`，默认 ≤ 20MB） |
| `email` | 是 | 玩家邮箱（合法格式） |
| `id` | 否 | 已绑定的用户 ID（与邮箱匹配时免验证码） |
| `code` | 条件必填 | 邮箱验证码（未绑定或绑定不匹配时必须） |
| `nickname` | 否 | 昵称，≤ 20 字符，默认"玩家" |
| `gamename` | 否 | 游戏名，≤ 40 字符 |
| `description` | 否 | 问题描述，≤ 2000 字符 |

限流：同一 IP 与同一邮箱各 3 次/小时（可配）；队列满（默认 20）返回 429。

响应示例：

```json
{
  "ok": true,
  "report_id": "ERMTNLXZQ4BAEA165D",
  "status": "queued",
  "message": "上传成功，已入队等待分析...",
  "poll": {
    "method": "GET",
    "path": "/api/error-reports/ERMTNLXZQ4BAEA165D",
    "token": "e9f2a1c4b3d5..."
  },
  "ttl_hours": 168
}
```

> `report_id` 以 `ER` 开头。客户端应保存 `poll.token` 用于轮询结果。

### 2.16 错误报告：查询分析结果

```
GET /api/error-reports/{id}?token=<poll.token>
```

`token` 也可通过请求头 `X-Report-Token` 传递。token 错误返回 403。

响应示例（分析完成时）：

```json
{
  "ok": true,
  "report_id": "ERMTNLXZQ4BAEA165D",
  "status": "done",
  "created_at": "2026-09-04T23:51:17.788Z",
  "updated_at": "2026-09-05T11:17:41.984Z",
  "ticket_id": "T20260905-111741502",
  "result": "# Minecraft 模组包崩溃分析报告\n\n## 基础信息\n...",
  "error": null
}
```

| 状态 | 说明 |
|---|---|
| `queued` | 已入队，等待分析 |
| `processing` | 分析中 |
| `done` | 完成，`result` 为 Markdown 分析报告 |
| `error` | 失败，`error` 字段为失败原因 |

> 分析完成后会自动生成一条工单（`ticket_id`），并将报告发送至玩家邮箱。错误报告与工单数据存储在 D1，14 天后自动清理。

### 2.17 SSO 登录地址（客户端跳转用）

```
GET /api/oauth/qq/login-url
```

返回 `{ "url": "https://..." }`，前端可将用户 302 跳转到该地址完成 SSO 统一登录（兼容旧调用名，实际指向自建 SSO 平台 sso.camzy.uno）。

---

## 3. SSO 登录流程（浏览器跳转）

第三方登录统一走自建 SSO 平台（`https://sso.camzy.uno`，标准 OAuth2 + OIDC）。Worker 仅作为 SSO 的一个 OAuth 客户端。

| 路由 | 说明 |
|---|---|
| `GET /auth/login?next=/admin.html` | 302 跳转 SSO 授权页 `sso.camzy.uno/oauth/authorize`（未配置 SSO_CLIENT_SECRET 时返回 400） |
| `GET /auth/callback` | SSO 回调：`code` 换 token → 读取 userinfo → 按 `sub` 关联管理员并建立本站会话（`state=bind` 时执行绑定，否则登录） |
| `GET /auth/qq` | 兼容旧入口，同样 302 到 SSO 授权页 |
| `GET /auth/qq/callback` | 旧 QQ 回调，302 回 `/auth/login`（已迁移，SSO 不再回调此处） |
| `GET /auth/qq/bind-callback` | 旧 QQ 绑定回调，302 回个人中心（已迁移） |
| `GET /auth/logout` | 登出，302 回首页并清除 Cookie |

说明：

- SSO 登录仅对**已绑定 SSO 账号的管理员**生效（绑定关系存于管理员档案的 `oauth.sso.sub`），未绑定账号跳转会显示错误页。
- 账号关联使用 SSO 的 `sub`（用户永久唯一 ID），不使用邮箱或昵称。
- 绑定入口：登录管理后台后访问 `GET /api/oauth/qq/bind-url`、`GET /api/oauth/github/bind-url`（需管理员会话，两个接口现均返回 SSO 绑定授权 URL），得到授权 URL 后完成绑定。
- 历史已绑定的 GitHub/QQ 账号（`oauth.github` / `oauth.qq`）仍保留展示，但登录时需通过 SSO 重新绑定。

---

## 4. 管理接口（管理员 或 Token）

除特别标注外，以下接口均支持「管理员会话」或「`Authorization: Bearer mz_xxx`」两种方式。

### 4.1 管理统计

```
GET /api/admin/stats
```

```json
{
  "stats": {
    "mods": 40,
    "releases": 5,
    "tickets": 10,
    "pendingTickets": 2,
    "currentVersion": "1.0.10",
    "lastReleaseTag": "v1.0.10"
  },
  "recentReleases": [
    { "id": 383191859, "tag": "v1.0.10", "name": "...", "published_at": "...", "html_url": "..." }
  ],
  "recentTickets": [
    { "id": "T...", "nickname": "...", "gamename": "...", "status": "new", "createdAt": "..." }
  ]
}
```

### 4.2 模组管理

```
GET    /api/admin/mods                          # 模组完整列表（含 size/mtime）
POST   /api/admin/mods                          # 上传 .jar 或 .zip（自动解压提取 mods/ 下 jar）
POST   /api/admin/mods/rename                   # 重命名
DELETE /api/admin/mods/{name}                   # 删除（name 需 URL 编码）
```

**上传**（multipart/form-data）：字段 `file`，支持 `.jar` 或 `.zip`（zip 自动解压提取 `mods/` 目录下的 jar），单文件默认 ≤ 100MB。上传成功后自动触发打包发布。

响应示例：

```json
{ "ok": true, "count": 2, "mods": [ { "name": "a.jar", "size": 1234 } ], "publish": { "ok": true } }
```

**重命名** 请求体：

```json
{ "oldName": "old.jar", "newName": "new.jar" }
```

### 4.3 导入 mrpack 模组包

```
POST /api/admin/mrpack
Content-Type: multipart/form-data
```

字段：`file`（`.mrpack` 或 `.zip`）、可选 `message`（发布说明，≤500 字符）。

行为：

1. 解析 `modrinth.index.json`，筛选 `mods/` 下的 `.jar`；
2. 按清单地址下载并校验 SHA-1/SHA-512 哈希；
3. 删除仓库现有模组后写入新模组；
4. 自动打包发布。

响应示例：

```json
{ "ok": true, "downloaded": 40, "failed": 0, "mods": [ { "name": "a.jar", "size": 100, "ok": true } ], "publish": { "ok": true } }
```

部分失败时返回 `failed` 与 `errors`；全部失败返回 `502`。

### 4.4 手动发布

```
POST /api/admin/publish
Content-Type: application/json
```

请求体（可选）：

```json
{ "message": "本次更新内容" }
```

将当前模组列表打包（zip + 更新器），版本号自动 `bump`，创建 GitHub Release（tag `v<版本>`），并生成 `modpack.zip` / `mods-<版本>.zip` / `mod-updater.exe` 资产。

### 4.5 版本回滚

```
POST /api/admin/releases/rollback
Content-Type: application/json
```

请求体：

```json
{ "id": 383191859, "tag": "v1.0.9" }
```

将指定 Release 的模组包资产解包回滚到仓库（删除当前所有模组，写入目标版本模组），随后重新发布。`tag` 可选，默认使用目标 release 的 tag。

### 4.6 删除版本

```
DELETE /api/admin/releases/{id}
```

删除 GitHub Release 及其 tag，并刷新本地缓存状态（回退到最新一个可用版本）。

### 4.7 工单管理

```
GET    /api/admin/tickets                                  # 工单列表
GET    /api/admin/tickets/{id}                             # 工单详情（完整对象，含 replies）
POST   /api/admin/tickets/{id}/reply                       # 管理员回复
POST   /api/admin/tickets/{id}/close                       # 关闭工单
POST   /api/admin/tickets/{id}/reopen                      # 重新打开
POST   /api/admin/tickets/{id}/ai                          # AI 生成回复草稿
DELETE /api/admin/tickets/{id}                             # 删除工单
```

- **回复** 请求体：`{ "content": "..." }`，回复后状态变为 `replied`（已关闭的不再改动），并通过邮件通知玩家。
- **关闭**：状态置为 `closed`，邮件通知玩家。
- **AI 草稿**：基于 wiki 知识库调用 GLM 生成回复草稿，返回：

```json
{ "ok": true, "draft": "您好，根据知识库...", "model": "glm-4.7-flash", "sources": [...] }
```

### 4.8 工单列表响应示例

```json
{
  "tickets": [
    {
      "id": "T20260906-143025123",
      "nickname": "玩家昵称",
      "gamename": "梦之韵",
      "email": "player@example.com",
      "status": "new",
      "createdAt": "2026-09-06T06:30:25.000Z",
      "replyCount": 0,
      "content": "加载世界时崩溃"
    }
  ]
}
```

---

## 5. 管理接口（仅管理员会话）

以下接口**不接受 API Token**，必须携带管理员会话 Cookie。

### 5.1 管理员账号管理

```
GET    /api/admin/users                                          # 用户列表
POST   /api/admin/users                                          # 创建用户（super/admin 可）
DELETE /api/admin/users/{username}                               # 删除用户
POST   /api/admin/users/{username}/password                      # 重置密码
POST   /api/admin/users/{username}/role                          # 调整角色（仅 super）
```

- **创建用户** 请求体：`{ "username": "abc", "name": "显示名", "password": "≥6位", "role": "admin" }`，用户名限字母/数字/下划线/短横线 2-32 位；创建 `super` 仅限超级管理员。
- **重置密码** 请求体：`{ "password": "新密码" }`；非 super 只能改自己。
- **调整角色** 请求体：`{ "role": "super" | "admin" }`；保护逻辑：不能删除/降级最后一个 super。
- 删除自己返回 400。

### 5.2 个人中心

```
POST /api/me/profile     # 更新显示名：{ "name": "新名字" }
POST /api/me/password    # 修改密码：{ "oldPassword": "...", "newPassword": "≥6位" }
```

### 5.3 OAuth 绑定（管理员会话）

```
GET  /api/oauth/qq/bind-url        # 返回 SSO 绑定授权 URL：{ "url": "..." }（兼容旧调用名）
GET  /api/oauth/github/bind-url    # 返回 SSO 绑定授权 URL：{ "url": "..." }（兼容旧调用名）
POST /api/oauth/unbind             # 解绑：{ "provider": "qq" | "github" | "sso" }
```

> 绑定/解绑均针对 SSO（`provider: "sso"`，按 `sub` 关联）；`qq` / `github` 为历史数据兼容保留。

---

## 6. 其他管理接口

### 6.1 通知邮箱列表（管理员 或 Token）

```
GET    /api/admin/notify-emails                     # { "emails": ["catkinr@qq.com"] }
POST   /api/admin/notify-emails                     # 添加：{ "email": "a@b.com" }
DELETE /api/admin/notify-emails/{email}             # 移除（email 需 URL 编码）
```

默认通知邮箱来自 `ADMIN_EMAIL`。玩家提交工单、追加留言时会给列表中所有邮箱发送通知。

### 6.2 API Token 管理（仅管理员会话）

```
GET    /api/admin/api-tokens          # 列表：{ "tokens": [{ "id", "name", "createdBy", "createdAt", "prefix" }] }
POST   /api/admin/api-tokens          # 创建：{ "name": "可选" } → { "ok": true, "id", "token": "mz_...", "name", "createdAt" }
DELETE /api/admin/api-tokens/{id}     # 撤销
```

> `token` 仅创建时返回一次，请立即保存；列表接口只显示 `prefix` 前缀。

---

## 7. 通用错误码

| 状态码 | 说明 |
|---|---|
| 400 | 参数缺失 / 格式错误（校验不通过） |
| 401 | 账号或密码错误 / 未登录 / 会话失效 |
| 403 | 权限不足 / token 不匹配 / 邮箱不匹配 |
| 404 | 资源不存在（模组、版本、工单、报告等） |
| 409 | 资源冲突（如账号已存在） |
| 429 | 限流（携带 `Retry-After` 与 `retry_after` 字段） |
| 500 | 服务器内部错误 |
| 502 | 依赖服务失败（邮件发送、模组下载等） |

错误响应统一为：

```json
{ "error": "人类可读的错误原因" }
```

---

## 8. 环境变量与 Secrets

### 环境变量（wrangler.toml `[vars]`）

| 变量 | 默认 | 说明 |
|---|---|---|
| `ADMIN_LOGIN` | `maoxinhe` | 默认管理员账号（首次初始化） |
| `ADMIN_EMAIL` | `catkinr@qq.com` | 工单/错误报告通知默认收件邮箱 |
| `BASE_URL` | `https://releases.camzy.uno` | 站点根地址（SSO 回调地址拼接用） |
| `SSO_CLIENT_ID` | `mzy_jzsmzjxn8r5pujj8` | SSO 平台应用 ID |
| `MAX_UPLOAD_MB` | `100` | 模组上传大小上限（MB） |
| `REPO_OWNER` / `REPO_NAME` / `REPO_BRANCH` | `maoxinhe` / `modpack` / `main` | GitHub 仓库定位 |
| `SESSION_TTL_HOURS` | `168` | 会话有效期（小时） |
| `MAIL_FROM` | `工单系统 <noreply@camzy.uno>` | 邮件发件人 |
| `ERROR_REPORT_*` | 见代码默认值 | 错误报告限流/大小/队列等可调参数 |

### Secrets（wrangler secret put）

| Secret | 用途 |
|---|---|
| `GLM_API_KEY` | 智谱 GLM 大模型密钥（错误报告分析与工单 AI 回复） |
| `RESEND_API_KEY` | Resend 邮件服务密钥（验证码 / 通知 / 报告） |
| `SSO_CLIENT_SECRET` | SSO 平台应用密钥（OAuth 换 token） |
| `GITHUB_TOKEN` | GitHub API 令牌（版本检测 / 发布 / 模组读写） |

---

## 9. 定时任务（Cron）

每分钟执行一次 `scheduled` 触发器，职责：

1. `migrateFromKV`：幂等地将旧 KV 工单/错误报告数据迁移到 D1（已在库中则跳过，并清理已迁移的 KV 键）；
2. `drainErrorReportQueue`：消费错误报告分析队列，逐个调用 GLM 分析并邮件发送结果；
3. `cleanupD1`：清理 D1 中超过 14 天的错误报告记录。

---

## 10. 数据存储结构（D1 为主，KV 为辅）

| 存储 | 用途 |
|---|---|
| D1 `tickets` | 工单（`id, data(JSON), createdAt`） |
| D1 `error_reports` | 错误报告（`id, data(JSON), createdAt`，14 天清理） |
| D1 `er_rl` | 错误报告限流计数（复合主键 `kind+k`） |
| D1 `er_meta` | 错误报告队列等元数据 |
| KV | 会话、验证码、绑定关系、API Token、镜像缓存等短生命周期数据 |
| R2 | 错误报告原始 zip 与模组文件存储 |
