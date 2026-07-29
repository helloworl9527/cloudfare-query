# nf-query 部署与运维手册

本文针对单台 Ubuntu 服务器上的生产部署。应用代码位于版本目录，两个 Node.js 进程只监听 loopback；Nginx 直接监听公网 443/80（Certbot 证书），Cloudflare 以代理模式（橙云）转发 `nf.mystool.me` 到本机公网 IP，不使用 Cloudflare Tunnel。Nginx 只信任来自 Cloudflare 官方 IP 段的 `CF-Connecting-IP`，绕过 Cloudflare 的直连源 IP 请求会被拒绝（`geo` 匹配失败返回 403）。整个流程不修改上游 `cloudflare_temp_email`，且不在本机保存上游管理员密码——新建/更新绑定由管理员手动粘贴该临时邮箱的地址 JWT，服务只向上游 `/api/settings` 做真实性校验。

## 1. 固定拓扑与权限边界

| 组件 | 身份与监听 | 可访问的持久数据 | 内存上限 |
|---|---|---|---:|
| `nf-query-public` | `nf-query-public`，`127.0.0.1:3789` | 只读 `shared/bindings.db`；地址 JWT 解密 credential | 512 MiB |
| `nf-query-admin` | `nf-query-admin`，`127.0.0.1:3790` | 读写绑定库、独占管理状态库；管理密码哈希 credential（不持有上游管理员密码） | 256 MiB |
| release 构建 | `nf-query-build`，不运行常驻服务 | 只写当次临时依赖构建目录，无数据库、备份或 credential 权限 | 非常驻 |
| Nginx | 公网 `443`/`80`，转发给 loopback 3789/3790 | 无邮箱/JWT/管理员凭据；持有仅用于 Nginx→admin 的代理认证共享值；Certbot 证书 | 由现有主机策略控制 |

文件布局：

```text
/opt/nf-query/
  releases/<version>/       # root:root，只读代码与生产依赖
  current -> releases/...   # 原子切换的当前版本

/var/lib/nf-query/
  shared/                   # 2750 admin:public，setgid
    bindings.db             # 0640 admin:public
  admin/                    # 0700 admin:admin
    admin-state.db          # 0600，及同权限 WAL/SHM

/var/backups/nf-query/
  weekly/                   # 最新 8 份，未加密
```

顶层 `/var/lib/nf-query` 不允许应用用户创建任意同级目录。公共 UID 只能遍历 `shared`，无法遍历 `admin`。systemd 为每个服务建立独立、只读的 credential 目录，因此公共服务既没有管理密码哈希，也没有任何上游凭据；管理服务也不持有上游管理员密码，只持有本地管理登录哈希。

管理入口只使用应用自身的 scrypt 密码、短会话、CSRF 与精确 Origin 校验；本部署不依赖 Cloudflare Access、MFA 或固定 IP。

`NFQ_TRUST_PROXY=1` 只有在两层约束同时成立时才安全：所有管理 API 先常量时间校验 Nginx 注入的 `X-NFQ-Proxy-Auth`；公共服务的 systemd cgroup 又拒绝连接 `127.0.0.1`/`::1`，而 Nginx 以专用源地址 `127.0.0.2` 访问 public。这样即使 public 进程失陷，也不能直连 admin 或借 Nginx 伪造 `CF-Connecting-IP` 绕过登录失败桶。该隔离依赖内核 cgroup BPF，发布脚本会做正反连接实测，失败即停止两个应用服务。

Nginx 直接暴露在公网 443/80，仅靠 `nf-query-cloudflare-ips.conf` 中的 Cloudflare 官方 CIDR `geo` 匹配拒绝绕过 Cloudflare 的直连请求；这不是主机防火墙级别的隔离（本机 443/80 由多个虚拟主机共用，无法只对 nf-query 做 IP 级过滤），只是应用层防线。其他本机服务 UID 仍属于主机信任边界。不要把 `3789`、`3790` 改为公网监听，也不要把它们加入防火墙开放规则。

## 2. 上线前置条件

主机必须具备：

- `/usr/bin/node` 和 `/usr/bin/npm`，Node.js 主版本严格为 24；
- `nginx`、`sqlite3`、`curl`、`rsync`、`certbot`（含 nginx 插件）、`util-linux`（提供 `flock`）和 systemd；若 `better-sqlite3` 没有适用的预编译包，还需 `build-essential` 与 `python3`；`age` 仅在重新启用备份加密（第 5 节）时才需要；
- `nf.mystool.me` 的 Cloudflare DNS 记录（代理/橙云）已指向本机公网 IP；
- 内核和 systemd 支持 cgroup BPF `IPAddressDeny`；`/etc/resolv.conf` 的 DNS 不能是 `127.0.0.1` 或 `::1`（`127.0.0.53` 可用）；
- 正确提交且未手工修改的 `package-lock.json`。

先验证运行时和基础工具：

```bash
/usr/bin/node --version
/usr/bin/node -p 'process.versions.node.split(".")[0]'
command -v nginx sqlite3 age curl rsync systemd-creds certbot
```

第二条必须只输出 `24`。不要用交互 shell 中的 nvm 路径代替 `/usr/bin/node`，systemd 不加载用户 shell 配置。

上游生产设置必须满足：

- 如启用上游 `PASSWORDS`，两个在线服务都配置同一个 `MAIL_CUSTOM_PASSWORD` credential；
- 邮件清理/Cron 已开启，使每箱平均保留量不超过 100 封；
- 已针对当前上游提交验证 `/api/mails` 和 `/api/settings` 契约。本部署不调用任何上游管理接口（`/admin/*`），因此不需要验证那些契约，也不需要上游管理员密码。

## 3. 安装主机集成

在仓库根目录运行：

```bash
sudo ./scripts/install-host.sh
```

脚本会拒绝非 Node 24 主机，并完成以下可重复操作：创建并严格校验 public/admin/build 三个互异的系统 UID/GID、建立隔离数据目录、生成 root-only 的代理共享密钥、安装 systemd/tmpfiles/Nginx 配置、安装备份工具、运行 `systemd-analyze verify` 和 `nginx -t`，最后只启用（不启动）应用服务及备份 timer。若同名账号不是独占的系统身份、含额外组成员或数字 UID/GID 有别名，脚本会 fail closed。构建 UID 不加入任何运行时组，不能读取数据库或 credentials。它不会删除服务器已有 Nginx 站点。首次安装后需要单独执行 `certbot --nginx -d nf.mystool.me` 签发证书（见第 6 节）；后续重跑安装器不会清除已签发的证书或 Certbot 写入的 SSL 配置。

非敏感覆盖项可从 `deploy/systemd/public.env.example` 和 `admin.env.example` 安装到 `/etc/nf-query/public.env`、`/etc/nf-query/admin.env`。这些文件只允许放 origin、上游 URL 和资源参数；密码、JWT 密钥、会话值不得写入其中。生产端口固定为 3789/3790，发布健康检查和 Nginx upstream 都依赖该约定。

## 4. 创建并注入凭据

### 4.1 地址 JWT 加密密钥

生成 32 字节随机值，并直接写入机器绑定的 systemd encrypted credential：

```bash
openssl rand -hex 32 | sudo ./scripts/install-systemd-credential.sh address-jwt-key
```

应用接受 32 字节原始值、64 位 hex 或 32 字节的 base64/base64url 表示。将原始密钥另存于受控密码库；不要和 `bindings.db` 或其备份放在同一存储位置。丢失此密钥后，现有地址 JWT 密文不可恢复。

### 4.2 管理密码哈希

使用应用自身 CLI 生成 scrypt 哈希；不要把明文密码放进 shell 参数或历史记录。CLI 要求密码为 12 至 1024 字节，并从 stdin 读取。将它输出的单行 `scrypt$...` 值直接通过标准输入安装：

```bash
read -r -s -p 'nf-query admin password: ' ADMIN_PASSWORD; echo
ADMIN_PASSWORD_HASH="$(printf '%s' "$ADMIN_PASSWORD" | \
  /usr/bin/node src/cli.js hash-password)"
unset ADMIN_PASSWORD
printf '%s\n' "$ADMIN_PASSWORD_HASH" | \
  sudo ./scripts/install-systemd-credential.sh admin-password-hash
unset ADMIN_PASSWORD_HASH
```

以上命令可在干净仓库根目录直接用 Node 24 执行；`hash-password` 分支只加载 Node 内置依赖，不要求先运行 `npm ci`。已发布主机也可把 CLI 路径换成 `/opt/nf-query/current/src/cli.js`，credential 安装脚本换成 `/opt/nf-query/current/scripts/install-systemd-credential.sh`。不要保留包含明文密码的临时文件。

### 4.3 上游管理员密码：本部署不使用

本部署不在任何本机进程中存储上游管理员密码。新建绑定或更换临时邮箱时，管理员在 `/admin` 页面手动粘贴该邮箱的地址 JWT（从上游后台 `show_password` 功能取得），服务只调用上游只读的 `/api/settings` 校验 JWT 与地址一致，从不调用任何 `/admin/*` 上游接口。这样即使 `nf-query-admin` 进程失陷，攻击者也拿不到可以操作整个上游邮箱系统的管理员密码，代价是没有批量自动补发机制（见第 9 节）。

### 4.4 可选上游 custom password

仅当上游启用 `PASSWORDS` 时才需要，credential 名使用 `mail-custom-password`。隐藏读取后安装：

```bash
read -r -s -p 'Upstream custom password: ' MAIL_CUSTOM_PASSWORD; echo
printf '%s\n' "$MAIL_CUSTOM_PASSWORD" | \
  sudo ./scripts/install-systemd-credential.sh mail-custom-password
unset MAIL_CUSTOM_PASSWORD
```

随后把示例 drop-in 同时安装给两个在线服务：

```bash
sudo install -D -m 0644 deploy/systemd/mail-custom-password.conf.example \
  /etc/systemd/system/nf-query-public.service.d/mail-custom-password.conf
sudo install -D -m 0644 deploy/systemd/mail-custom-password.conf.example \
  /etc/systemd/system/nf-query-admin.service.d/mail-custom-password.conf
sudo systemctl daemon-reload
```

只给其中一个服务安装该 credential 会导致另一个服务的上游调用失败。

### 4.5 Nginx 到 admin 的代理凭据

`install-host.sh` 首次运行时自动生成 `/etc/nf-query/proxy-auth-secret`，并生成只有 root 能读取的 Nginx snippet。Nginx 对 admin upstream 覆盖客户端同名 header 后注入该值；admin unit 通过独立 `LoadCredential` 读取，public unit 从未加载它，公共 upstream 还会显式清空客户端伪造的 header。

该共享值必须至少 32 字节。安装器后续运行会复用而不会静默轮换。不要提交真实 snippet，不要把 `nginx -T` 输出附到工单；它会以 root 权限展开 secret。需要轮换时应先在维护窗口替换 source 文件，再重跑 host installer、reload Nginx 并 restart admin，短暂的 403 比新旧值错配时放行更安全。

### 4.6 systemd credential 说明

encrypted credential 文件位于 `/etc/nf-query/credentials/*.cred`，磁盘上不是明文，服务启动时由 systemd 放入该 unit 私有的内存/临时文件系统。轮换 credential 后需要重启对应服务：

```bash
sudo systemctl restart nf-query-admin.service nf-query-public.service
```

systemd 机器密钥不是异机灾备手段。地址 JWT 加密密钥和管理凭据仍须保存到独立密码库，以便整机恢复。

三个会处理解密凭据的 unit 均设置 `LimitCORE=0`、`CoredumpFilter=0` 和 `MemorySwapMax=0`。本机 Ubuntu 使用管道式 apport collector；上线时必须用受控、无真实凭据的测试进程确认 `LimitCORE=0` 时不会在 `/var/crash` 或其他 collector 存储产生含内存段的报告。若发行版 collector 不尊重该限制，必须在主机策略中禁存 core（或使用等效的逐服务隔离）后才能注入真实凭据。不要为排障临时放开 core/swap 后忘记恢复。

## 5. 备份加密：本部署有意不启用

原方案要求备份用 age 加密到独立恢复环境持有的密钥，防止备份文件单独泄漏时可用。当前部署方按业务判断跳过了这层加密：`bindings.db` 中的地址 JWT 本身已经用 AES-256-GCM 逐条加密（密钥是独立于数据库文件的 `address-jwt-key` systemd credential，不出现在备份里），所以未加密的备份文件泄漏时不会直接暴露可用的 JWT；暴露的是 `external_id`、临时邮箱地址、备注等元数据。如果日后需要恢复这层防御，参照 `age-keygen` 生成独立 identity、把公钥装进 `backup-age-recipient` credential、在 `backup-bindings.sh` 里对快照调用 `age --recipient` 加密即可加回去。

管理会话库 `admin-state.db` 不备份。它丢失只会撤销所有管理会话和登录失败窗口，不影响绑定；恢复后管理员重新登录即可。

## 6. 发布和启动

首次及后续应用代码发布都在全部 credentials 已就绪后从仓库根目录执行。若本次版本修改了 `deploy/**`、`scripts/**` 或主机集成说明，必须先重新运行 `sudo ./scripts/install-host.sh`，确认它重新安装 `/etc` unit/Nginx 配置和 `/usr/local/libexec/nf-query` 运维脚本并通过配置检查，然后再运行 release；只执行 release 不会更新这些主机级副本。

发布应用代码：

```bash
sudo ./scripts/release.sh
```

也可显式指定不可变版本：

```bash
sudo ./scripts/release.sh --version 2026.07.10-1
```

发布脚本会：

1. 再次验证 Node 24、`package.json` 和 lockfile；
2. 把源码复制为 root-owned 只读 staging；由无数据库/credential权限的 `nf-query-build` 在独立临时目录执行 `npm ci --omit=dev --no-audit --no-fund`，只把 `node_modules` 移入 staging，避免 npm lifecycle 取得 root 或运行时身份；
3. 实际加载 `better-sqlite3` 并完成内存数据库读写冒烟，再用生产 Node 24 运行完整测试集；
4. 将 staging 改名为不可变版本目录，原子替换 `current` 软链接；
5. 先重启管理服务并直连 health，让迁移完成，再重启公共只读服务并检查 health；
6. 任一 health 在 25 次检查内未成功时，原子恢复旧 `current` 并重启旧应用版本；
7. 用 transient systemd unit 证明无过滤时 loopback 可达、挂载 `IPAddressDeny` 后不可达，再确认 `127.0.0.2` 仍能访问 public；隔离无效时停止应用。

需要只准备版本、不重启进程时使用 `--no-restart`。自动回滚只切换应用代码，不能撤销已经提交的 SQLite 迁移；所有在线迁移都必须至少向后兼容一个 release。破坏性迁移必须单独走维护窗口、预备恢复备份并使用 `--no-restart` 人工切换。脚本不会自动删除旧版本，清理前必须确认当前软链接、恢复备份和迁移的向后兼容性。

安装或修改 Nginx 配置后：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

首次上线（或证书丢失后重新签发）需要用 Certbot 为 `nf.mystool.me` 签发证书并让它接管 SSL 配置段。前提是 Cloudflare 上 `nf.mystool.me` 的 DNS 记录（代理模式）已经指向本机公网 IP：

```bash
sudo certbot --nginx -d nf.mystool.me --non-interactive --agree-tos --redirect
sudo systemctl enable --now nf-query-backup.timer
```

Certbot 会把 `deploy/nginx/nf-query.conf` 中的单一 80 端口 server block 原地改造成 443 SSL block + 80 重定向 block（同本机其它域名的既有模式），并注册自动续期 timer。之后如果重新运行 `install-host.sh` 覆盖了 `/etc/nginx/sites-available/nf-query.conf`，需要确认 repo 内 `deploy/nginx/nf-query.conf` 已经包含 Certbot 写入的 `ssl_certificate`/`ssl_certificate_key` 行（当前版本已经手工回填），否则站点会退回纯 HTTP。

确认 Cloudflare 没有对该 hostname 应用 `Cache Everything` 等强制缓存规则；源站所有响应都带 `Cache-Control: no-store`。Cloudflare SSL/TLS 模式应设为 `Full (strict)`。

检查启动状态：

```bash
systemctl --no-pager --full status nf-query-admin nf-query-public
ss -lntp | grep -E ':(3789|3790|443|80)\b'
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H 'Host: nf.mystool.me' http://127.0.0.1/
curl -sS -o /dev/null -w '%{http_code}\n' https://nf.mystool.me/
```

3789/3790 只能显示为 `127.0.0.1`；443/80 是本机唯一预期公网监听。经 Cloudflare 的最后一条应返回公开页面的成功状态。

## 7. 备份、轮转和恢复演练

`nf-query-backup.timer` 在每周日 UTC 03:05 运行一次。备份脚本先对源库执行 `PRAGMA quick_check`，再通过 SQLite online backup API 把事务一致快照写入该 oneshot 专属的 `/run/nf-query-backup`（systemd 管理的 0700 临时目录，unit 退出即回收），再次 `quick_check` 后原子放入 `/var/backups/nf-query/weekly/`。发布时先原子放置 checksum，最后才把 `*.sqlite` 改名为可见文件，因此枚举备份的同步器不会观察到缺少 checksum 的已发布备份。快照本身不加密（见第 5 节），文件权限仍是 `0600 nf-query-admin`。成功日志只含文件名、大小和耗时。

手工触发并检查：

```bash
sudo systemctl start nf-query-backup.service
sudo journalctl -u nf-query-backup.service -n 30 --no-pager
sudo systemctl list-timers nf-query-backup.timer
sudo -u nf-query-admin bash
cd /var/backups/nf-query/weekly
LATEST="$(find . -maxdepth 1 -name '*.sqlite' -printf '%T@ %f\n' | sort -rn | head -1 | cut -d' ' -f2-)"
sha256sum -c "$LATEST.sha256"
exit
```

保留策略按份数而不是文件年龄执行：最新 8 份周备份（约 2 个月）。timer 使用 `Persistent=true`，短时关机后会补跑一次。失败的检查不会覆盖既有成功备份。备份目前只落在本机磁盘，没有异地副本；磁盘/主机整体损坏会导致连同备份一起丢失，这是当前业务判断下接受的取舍。

每月至少完成一次恢复演练：

```bash
./scripts/restore-drill.sh /var/backups/nf-query/weekly/bindings-20260710T050000Z.sqlite
```

脚本验证可选 SHA-256 sidecar、完整 `PRAGMA integrity_check`、`bindings` 表和 `schema_migrations` 的当前版本（默认必须为 1；以后新增迁移时须同步更新脚本默认值，或在演练中显式设置 `EXPECTED_SCHEMA_VERSION`），只输出行数等非敏感元数据，退出时删除临时副本。演练记录至少包括日期、备份文件名、退出状态、绑定行数、耗时和执行人。

恢复生产库时先停止两个应用服务并确认没有打开数据库的进程。把故障 `bindings.db` 连同同目录下可能存在的 `bindings.db-journal`、`bindings.db-wal`、`bindings.db-shm` 一并移入带时间戳的隔离目录；绝不能把旧 hot journal 留在新库旁，否则 SQLite 可能用旧事务回滚刚恢复的数据库。随后使用已演练的备份文件验证完整性，再由管理员以 `0640 nf-query-admin:nf-query-public` 原子放入 `shared/bindings.db`。先启动 admin 完成迁移并检查 health，再启动 public。这是会替换生产数据的操作，不由自动脚本执行；必须走人工变更和回退审批。

## 8. 日志、指标和告警

### 8.1 日志边界

Node 服务写 stdout/stderr，由 journald 收集：

```bash
journalctl -u nf-query-public.service -u nf-query-admin.service --since '1 hour ago'
```

Nginx 使用专用 `nf_query` 格式，只记录 request ID、客户端 IP、方法、状态、字节数和耗时；连 `$uri` 也不记录，因为恶意客户端可把完整标识塞进任意畸形路径。该格式不记录请求体、Cookie、Authorization、查询参数或响应正文。Nginx error record 无法脱敏原始 request line，因此本 vhost 的 request-context error stream 明确写入 `/dev/null`；日常 4xx/5xx 与 upstream 状态从安全 access log、应用 journald 和监控平台排查，Nginx 启停/配置等进程级错误仍由全局日志和 systemd 捕获。proxy buffering 已关闭，邮件响应不会落到 Nginx 临时文件。公开 API 必须继续用 POST body 传外部标识。

应用日志/聚合规则严禁记录：外部标识、完整临时邮箱、地址 JWT、邮件 raw/正文/HTML、附件、管理员密码或哈希、custom password、session/CSRF token、Cookie。错误日志只能记录 request ID、错误类别、状态和非敏感计量值。

### 8.2 最低指标集

应用结构化日志或现有指标平台至少聚合：

| 类别 | 指标/字段 |
|---|---|
| 流量 | public/admin 请求量、状态码、路由、总耗时 |
| 资源队列 | 活跃 workflow、队列深度、排队毫秒、排队超时/饱和 503 |
| MIME | 解析数、解析毫秒、并发、raw 超限、正文截断、解析失败 |
| Node | RSS、heap、事件循环延迟、进程重启次数 |
| 上游 | 请求耗时，401/429/5xx/1102/超时/响应超限计数 |
| D1 | nf-query 的 `*_estimated` 容量估算；真实 `rows_read`/`rows_written` 只能从 Cloudflare D1 Dashboard/账户可观测接口采集 |
| 主机 | 备份年龄、磁盘总量/可用量、timer 最后结果、Nginx 5xx |

两个 Node 进程分别在 loopback 提供 Prometheus text；Nginx 对所有公网 `/internal/` 请求固定返回 404，不对外暴露这些端点。public cgroup 拒绝以 `127.0.0.1` 为 peer 的连接，因此主机采集器访问 public 时必须像 Nginx 一样绑定源地址 `127.0.0.2`：

```bash
curl --interface 127.0.0.2 --fail http://127.0.0.1:3789/internal/metrics
curl --fail http://127.0.0.1:3790/internal/metrics
curl --interface 127.0.0.2 --fail http://127.0.0.1:3789/internal/health
curl --fail http://127.0.0.1:3790/internal/health
```

`scripts/metrics-snapshot.sh` 输出不含业务数据的 Prometheus text，覆盖 unit 存活、systemd cgroup 内存、最新备份年龄、上次备份结果，以及数据库/备份文件系统空间。可由现有的 root 监控 agent 调用，或复制到 node_exporter textfile collector；它不新建公网 metrics listener，也不应为了采集而给普通监控 UID 开放数据库目录。

建议初始告警：

- public RSS 超过 460 MiB 或 admin RSS 超过 230 MiB 持续 5 分钟；
- 事件循环延迟 p99 超过 250 ms 持续 5 分钟；
- 最新周备份超过 9 天，或 backup unit 失败；
- 数据盘可用空间低于 20%（低于 10% 升为紧急）；
- 任意上游 401、1102，或 5 分钟内持续出现 429/5xx；
- public 503/504 比例超过 2%，队列持续满，或进程出现 OOM 重启；
- D1 行读写接近 Free 套餐日限额的 70%/90%。

容量基线为：

```text
rows_read/query ≈ 邮箱保留邮件数 + 10
(100 封/箱 + 10) × 10,000 次查询/日 ≈ 约 1,100,000 rows_read/日
```

当前锁定上游只向 nf-query 返回 `{results,count}`，不会透传 D1 的逐请求 `meta`。应用指标 `upstream_d1_rows_read_estimated` 按 `count + 10` 累加，`upstream_d1_rows_written_estimated` 按每次查询 1 次 `address.updated_at` 累加；两者明确只是容量估算，不能冒充 D1 计费值。真实读写行必须从 Cloudflare D1 Dashboard或账户侧可观测接口独立采集并告警。平均邮件数超过 100 时，10,000 次/日目标自动失效，应先缩短上游保留期或重新评估套餐。

## 9. 常见故障处置

| 现象 | 首查 | 处置 |
|---|---|---|
| public 返回 503 | queue depth、RSS、邮件 raw 大小 | 等待峰值消退；确认 4/64/15s 和 MIME=2 配置未被放大；不要用无界并发规避 |
| public 返回 504 | 上游耗时、DNS/TLS、8s deadline | 检查上游可用性；保持 Nginx 30s 大于应用总 deadline |
| public 映射 502 / 上游 401 | 地址 JWT 是否因全局密钥轮换失效 | 管理员在 `/admin` 逐个绑定粘贴新 JWT（“更新凭据”）；本部署没有批量自动补发 |
| 上游 429/5xx/1102 | 上游日志和 D1/Worker Dashboard | 降低真实冒烟并发，确认保留量和 Free 配额；不要切到批量 parsed endpoint |
| `readonly database` | `namei -l`、DB owner/mode、挂载只读状态 | 运行 tmpfiles 修复目录；仅 admin 可写，禁止给 public 写权限 |
| `database is locked` | 是否误启 WAL、长事务或外部调用包在事务中 | 主库保持 DELETE journal；升级应用后复查事务边界 |
| 磁盘满 | DB、Nginx/journal、备份和旧 release 占用 | 先确认最新备份完好，再按变更流程清理；不得删除活动 DB/WAL |
| credential missing | unit 的 LoadCredential 和 `.cred` 文件 | 重新安装正确 credential 并重启对应 unit；勿改用普通 `.env` |

主库写连接启用 `secure_delete=ON`，使本地删除/更新释放的 SQLite 页面被清零；这不删除仍在保留期内的备份。若从早期未启用该设置的数据库升级，应先完成并验证备份，再在维护窗口停止两个服务、执行一次 `VACUUM`、复核 `integrity_check` 和文件权限后重启，避免历史 freelist 内容继续可见。

地址 JWT 是无期限能力凭证。本地删除绑定、修改管理密码或“更新凭据”都不会撤销已经泄漏的旧 JWT。本部署不持有上游管理员密码，因此没有批量自动补发手段；事故撤销流程是：在上游轮换全局 `JWT_SECRET`，确认旧 JWT 失效，然后管理员在上游后台逐个取出新 JWT，通过 `/admin` 页面的“更新凭据”逐条粘贴替换。绑定数量较多时该操作会造成对应绑定的查询在补齐前持续失败，应在维护窗口执行并逐条核对：

```bash
sudo systemctl start nf-query-backup.service
# 此时在上游轮换 JWT_SECRET，并用旧 JWT 验证其已失效。
# 逐个绑定：在 /admin 取出新 JWT 后通过“更新凭据”粘贴，或调用
# POST /admin/api/bindings/:id/credential/replace { version, address_jwt }。
```

## 10. 权限与安全验收

每次主机重装、权限修复或 systemd 修改后运行：

```bash
sudo systemd-tmpfiles --create /etc/tmpfiles.d/nf-query.conf
namei -l /var/lib/nf-query/shared/bindings.db
namei -l /var/lib/nf-query/admin/admin-state.db
sudo -u nf-query-public test -r /var/lib/nf-query/shared/bindings.db
! sudo -u nf-query-public test -w /var/lib/nf-query/shared/bindings.db
! sudo -u nf-query-public test -r /var/lib/nf-query/admin/admin-state.db
sudo systemd-analyze security nf-query-public.service nf-query-admin.service
sudo /opt/nf-query/current/scripts/verify-loopback-isolation.sh
stat -c '%U:%G %a %n' /etc/nf-query/proxy-auth-secret \
  /etc/nginx/snippets/nf-query-proxy-secret.conf
```

还应确认：

- public unit 的 `systemctl show -p LoadCredential -p LoadCredentialEncrypted` 中没有 `proxy-auth-secret`；两个 unit 均不存在任何 `mail-admin-password` credential（本部署从未安装它）；
- `systemctl show -p LimitCORE -p MemorySwapMax` 显示敏感 unit 的 core limit 和 swap 均为 0，`/proc/$PID/coredump_filter` 为 0；受控崩溃验收未产生含内存的 apport/systemd-coredump 文件；
- 两个 proxy secret 文件都是 `root:root 600`，直接请求 `127.0.0.1:3790/admin/api/*` 因缺少可信代理头返回 403；
- loopback isolation verifier 的 control 连接成功、deny 连接失败、`127.0.0.2` allow 连接成功；若内核/容器不支持 cgroup BPF，禁止上线；
- 两个 Node socket 只绑定 `127.0.0.1`；Nginx 443/80 是本机唯一预期的公网监听；
- 伪造 `X-Forwarded-For`/`CF-Connecting-IP` 直连源站公网 IP（不经 Cloudflare）返回 403（`nf-query-cloudflare-ips.conf` 的 `geo` 拒绝）。用 `curl --resolve` 测试这条时，本机 curl 在 `--resolve` 到自身公网 IP 或 `127.0.0.1` 时观察到未按预期发送 SNI（会拿到本机另一个虚拟主机的证书，请求实际未命中 nf-query 的 server block，测出的 200 是假阳性）；改用 `openssl s_client -connect <ip>:443 -servername nf.mystool.me -quiet` 手工发一个 `Host: nf.mystool.me` 的 HTTP 请求验证，正确结果应为 403 且带有 nf-query 的安全响应头；
- 管理写请求拒绝错误 Origin、缺失/错误 CSRF、过期或注销后的 session；
- 管理 Cookie 为 `Path=/admin; Secure; HttpOnly; SameSite=Strict`，绝对有效期 8 小时；
- 同一可信 IP 在 10 分钟内第 6 次错误登录被拒绝，而公开查询永不返回 429；
- Nginx 响应包含严格 CSP、`Cache-Control: no-store` 和 `Referrer-Policy: no-referrer`；公开站点的 CSP 只额外放开 `frame-src 'self'` 与 `style-src 'unsafe-inline'`（供邮件正文 iframe 使用），`script-src` 仍为 `'self'`、`img-src` 不含任何远程主机，且 Nginx 与 `src/shared/http.js` 中的 `PUBLIC_CSP` 必须保持一致（浏览器同时强制两份策略）；
- access/error/journal 样本中没有外部标识、邮件、JWT、密码、Cookie 或 CSRF 值。

## 11. 上线门禁

上线前逐项完成并留存结果：

1. Node 24 检查、`npm ci --omit=dev` 和 `better-sqlite3` 加载通过；
2. `systemd-analyze verify`、`nginx -t` 通过；`certbot renew --dry-run` 对 `nf.mystool.me` 成功；
3. systemd 文件权限隔离和 MemoryMax 验证通过；
4. 测试绑定创建（粘贴 JWT）、修改、测试、更新凭据、删除以及完整公开查询成功；
5. 公开页面最近 10 封、HTML 正文在沙箱 iframe 内按原貌渲染（远程图片全部不加载）、HTML/纯文本切换、100 KiB 纯文本与 200 KiB HTML 截断和北京时间展示正确；
6. 模拟上游完成 40 并发和 10 KiB/500 KiB/2 MiB raw 故障压测，无 OOM 或长时间事件循环阻塞；
7. 真实上游仅做低并发冒烟，并从 Cloudflare D1 Dashboard/账户侧可观测数据核对真实 rows read/write，再与本地 `*_estimated` 指标比较；
8. 周备份成功，恢复演练成功（业务已决定备份不加密、不做异地副本，见第 5 节）；
9. 平均每箱邮件数不超过 100，Free 配额对容量模型仍有余量；
10. 可选 custom password（如上游启用 `PASSWORDS`）在两个在线服务中配置一致；确认本机没有任何进程持有上游管理员密码。

任一门禁失败都不应通过扩大内存、放宽权限、记录敏感数据或关闭安全校验来绕过。
