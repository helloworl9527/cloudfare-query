# nf-query

`nf-query` 是部署在自有 Ubuntu 主机上的临时邮箱查询网关，适配上游
[`cloudflare_temp_email` 提交 `565bb839`](https://github.com/dreamhunter2333/cloudflare_temp_email/commit/565bb839dbe62f879ac11f1d86396bdd79f5213e)，不修改上游代码。

客户只提交一个已绑定的外部邮箱，读取对应临时邮箱最近 10 封邮件的纯文本投影。这个产品模式不构成客户认证：任何知道外部标识的人都可能读到邮件，不能把它理解为私密收件箱或查询令牌机制。

## 服务边界

- `nf-query-public`：`127.0.0.1:3789`，只读打开 `bindings.db`，只持有地址 JWT 解密密钥，只调用上游 `/api/mails`。
- `nf-query-admin`：`127.0.0.1:3790`，独占主库写权限、`admin-state.db`、应用密码哈希。**不存储上游管理员密码**：新建/更新绑定时由管理员手动粘贴该临时邮箱的地址 JWT，服务只向上游 `/api/settings` 做真实性校验，不调用任何上游管理接口。
- Nginx：直接公网监听 443/80（Certbot 证书），只信任 Cloudflare 官方 IP 段发来的 `CF-Connecting-IP`，拒绝绕过 Cloudflare 的直连请求。

地址 JWT 以 AES-256-GCM 加密保存。管理会话使用服务端随机 token、8 小时绝对期限、精确 Origin 和 CSRF；登录失败按可信代理提供的客户端 IP 执行 10 分钟 5 次限制。公共查询没有客户限流，只有 4 个工作流、64 个等待项和 MIME 全局并发 2 的资源保护。

不存储上游管理员密码换来的代价：新建绑定和更改临时邮箱都需要管理员手动去上游后台取出 JWT 再粘贴；上游全局 JWT secret 一旦轮换，所有绑定的 JWT 需要逐个手动重新粘贴，没有批量自动恢复手段。

## 运行要求

- Node.js 24 LTS（服务入口和发布脚本都会拒绝其他主版本）
- SQLite / `better-sqlite3`
- Nginx、systemd、certbot
- `sqlite3` CLI、`rsync`（发布用）

安装生产依赖并测试：

```bash
npm ci
npm test
```

启动服务前必须使用 systemd credentials 提供密钥，不能使用普通 `.env`。完整的主机安装、凭据创建、备份恢复和上线门禁见 [运维手册](docs/operations.md)。更新 `deploy/**` 或 `scripts/**` 后需要先重跑主机安装器，再发布应用代码，否则 `/etc` 与 `/usr/local/libexec` 中仍会运行旧副本。

## API

公开接口：

```http
POST /api/query
Content-Type: application/json

{"external_id":"18371@gmail.com"}
```

成功响应只含 `subject`、`from`、`received_at`、可空 `sent_at`、`body_text`、`body_html`、`html_truncated`、`blocked_images`、`truncated` 和 `parse_status`；不会返回完整临时邮箱、JWT、raw 或附件。

`body_html` 是服务端净化后的正文：白名单标签与属性，`<script>`/`<style>`/`<iframe>`/表单等连同内容一并丢弃，事件属性、`javascript:` 链接以及能发起远程请求的内联 CSS（`url()`、`@import` 等）被剥离，**所有图片的 `src` 一律移除**（`blocked_images` 为被屏蔽的图片数），因此跟踪像素不会加载。前端默认用它渲染，放在 `sandbox` 且不含 `allow-scripts` 的 iframe 内，`body_text` 作为可切换的纯文本视图与纯文本邮件的唯一正文。上限由 `NFQ_BODY_HTML_MAX_BYTES`（默认 200 KiB）控制，超出时截断并置 `html_truncated`。

管理接口位于 `/admin/api/*`，包括登录/注销/会话、绑定列表与搜索、创建（只需 `external_id` + 管理员手动粘贴的 `address_jwt`；临时邮箱地址从 JWT 自身声明中解析，不单独输入）、`PATCH` 更新、本地删除、凭据测试和“更新凭据”（`/credential/replace`，同样需要粘贴新 JWT）。该接口不会轮换或撤销旧 JWT。管理页面支持中英文界面切换。

## 数据迁移与维护 CLI

```bash
node src/cli.js migrate
printf '%s' 'a-long-admin-password' | node src/cli.js hash-password
```

生产中应通过对应 systemd unit 执行迁移，并从 stdin 生成密码哈希，避免秘密出现在参数和 shell 历史中。
