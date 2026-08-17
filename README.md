<div align="center">

# 🦆 鸭鸭图床 (DuckImg)

<p>
  <img src="logo/鸭鸭.png" alt="鸭鸭图床 Logo" width="120" height="120">
</p>

**基于 Telegram + Cloudflare Workers 的免费图床**

无限存储 · 安全可靠 · 克制现代 UI · 中英双语

<p>
  <a href="https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.2.1"><img src="https://img.shields.io/badge/release-v2.2.1-blue?style=flat-square" alt="v2.2.1"></a>
  <a href="https://github.com/QCEnjoyLL/DuckImg/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/QCEnjoyLL/DuckImg/ci.yml?branch=main&style=flat-square&label=CI" alt="CI"></a>
  <a href="https://github.com/QCEnjoyLL/DuckImg/stargazers"><img src="https://img.shields.io/github/stars/QCEnjoyLL/DuckImg?style=flat-square" alt="Stars"></a>
  <a href="https://github.com/QCEnjoyLL/DuckImg/network/members"><img src="https://img.shields.io/github/forks/QCEnjoyLL/DuckImg?style=flat-square" alt="Forks"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0%20%2B%20Commons%20Clause-purple?style=flat-square" alt="License"></a>
  <a href="https://telegram.org/"><img src="https://img.shields.io/badge/storage-Telegram-26a5e4?style=flat-square&logo=telegram&logoColor=white" alt="Telegram"></a>
  <a href="https://workers.cloudflare.com/"><img src="https://img.shields.io/badge/deploy-Cloudflare%20Workers-f38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Workers"></a>
</p>

</div>

---

## ✨ 产品亮点

| | | |
|:---:|:---:|:---:|
| **🚀 多种上传** | **💎 原图品质** | **🎨 克制 UI** |
| 拖拽 / 点击 / `Ctrl+V` 粘贴 · 支持批量 | 以 Telegram 文档方式存储，尽量保留清晰度 | iOS 气质设计系统 · 毛玻璃 · 独立配色 |
| **📱 移动友好** | **🔐 账户体系** | **🌐 中英双语** |
| 单侧栏抽屉 · 安全区 · 左滑关闭 | JWT 登录 · 邮箱验证 · 管理后台 | 侧栏 / 设置 / 帮助 / 图库等全站文案 |

---

## ⚡ 核心能力

### 上传与链接
- 拖拽、选择文件、剪贴板粘贴、批量上传
- 上传成功后一键复制：直链 / 预览 / HTML / Markdown
- 客户端可选：自动压缩、质量档位、文字水印、去除 EXIF

### 图库与整理
- 我的图片：网格 / 列表 / 时间线
- 搜索、标签筛选、收藏、拖拽自定义排序
- 批量复制链接、打标签、删除；统计面板（数量 / 占用 / 趋势）

### 账户与设置
- 注册 / 登录 / 邮箱验证 / 改密 / 换绑邮箱
- 一次性验证码（哈希存储、错误次数限制）与可撤销 JWT 会话
- 头像（上传或粘贴 URL）
- 系统设置：语言、配色、上传偏好、登录邮件提醒、清空本地缓存、删除全部图片
- 管理后台：用户管理、公告、上传上限、鉴黄、邮件、加密备份与站点配置
- 部署指纹：后台自动显示 Cloudflare Version ID 与部署时间，便于核对线上版本

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 多页静态 HTML / CSS / JS（无构建器） |
| 后端 | [Hono](https://hono.dev/) on Cloudflare Workers |
| 图片 | Telegram Bot API |
| 元数据 | Cloudflare D1（SQLite） |
| 部署 | Wrangler CLI · Cloudflare Version Metadata · GitHub Actions CI |

---

## 🚀 快速开始

### 前置

| 工具 | 说明 |
|------|------|
| Cloudflare 账户 | [cloudflare.com](https://cloudflare.com) |
| Telegram Bot | [@BotFather](https://t.me/BotFather) 创建，并准备频道/群 Chat ID |
| Node.js 22+ | [nodejs.org](https://nodejs.org/) |

### 部署

```bash
# 克隆
git clone https://github.com/QCEnjoyLL/DuckImg.git
cd DuckImg

# 安装依赖
npm install

# 登录 Cloudflare
npx wrangler login

# 自部署：把 wrangler.toml 里的 database_id 换成你自己的（下一步创建时输出）

# 首次：创建 D1 数据库（把输出的 database_id 填进 wrangler.toml），建表
npx wrangler d1 create duckimg
npm run migrate

# 配置密钥（完整清单见下方）
npx wrangler secret put TG_Bot_Token

# 部署
npm run deploy
```

### 本地开发

```bash
npm run dev
# 默认 http://localhost:8787
```

### 配置说明

`wrangler.toml` 已随仓库提供（内含 D1 绑定与 cron，无任何密钥）；自部署只需替换 `database_id`。

平台级密钥走 Cloudflare Secrets（服务端持久保存，换机器无需重配）：

```bash
npx wrangler secret put TG_Bot_Token      # Telegram Bot Token
npx wrangler secret put TG_Chat_ID        # 存储频道 ID
npx wrangler secret put JWT_SECRET        # 登录签名密钥
npx wrangler secret put BACKUP_ENCRYPTION_KEY # 备份加密密钥，务必离线保存
npx wrangler secret put ADMIN_USERNAME    # 管理员用户名
npx wrangler secret put ADMIN_BOOTSTRAP_TOKEN # 仅首次创建管理员时临时设置
npx wrangler secret put RESEND_API_KEY    # 邮件服务（可选）
npx wrangler secret put RESEND_FROM       # 邮件发件人（可选）
npx wrangler secret put NSFW_API_KEY      # 鉴黄服务密钥（启用时）
npx wrangler secret put NSFW_EXTRA_PARAMS # 鉴黄服务附加查询参数（可选）
```

SMTP 密码/授权码可直接在管理后台的「邮件设置」中填写。保存时会使用由 `JWT_SECRET`
派生的 AES-GCM 密钥加密后写入 D1，接口只返回是否已配置，不会回传密码或密文。旧部署中的
`SMTP_PASSWORD` Secret 仍兼容；在后台保存新密码后会自动改用 D1 配置。若轮换
`JWT_SECRET`，请在后台重新输入一次 SMTP 密码。数据库备份不会携带 SMTP 密文，恢复后也需
重新输入一次。

首次管理员注册需让用户名与 `ADMIN_USERNAME` 一致，并在注册请求中携带
`X-Admin-Bootstrap-Token`。创建成功后立即执行
`npx wrangler secret delete ADMIN_BOOTSTRAP_TOKEN`，关闭管理员创建入口。普通注册页面不会读取该密钥。

```powershell
$siteUrl = Read-Host "站点地址，如 https://example.workers.dev"
$adminName = Read-Host "ADMIN_USERNAME"
$adminEmail = Read-Host "管理员邮箱"
$bootstrap = Read-Host "ADMIN_BOOTSTRAP_TOKEN" -MaskInput
$adminPassword = Read-Host "管理员密码" -MaskInput
$body = @{ username = $adminName; email = $adminEmail; password = $adminPassword } | ConvertTo-Json
Invoke-RestMethod "$siteUrl/api/auth/register" -Method Post -ContentType "application/json" -Headers @{ "X-Admin-Bootstrap-Token" = $bootstrap } -Body $body
Remove-Variable bootstrap, adminPassword, body
npx wrangler secret delete ADMIN_BOOTSTRAP_TOKEN
```

升级已有部署时，必须先执行 `npm run migrate`，确认 `0002_security_hardening.sql` 已应用，再执行
`npm run deploy`；新代码依赖 `users.token_version` 与 `verification_codes`，顺序颠倒会导致认证接口失败。

部署成功后由 Cloudflare Workers 提供 HTTPS 访问地址（本项目示例：Workers 路由，非 Pages）。
管理员登录后台后，可在页眉查看当前 Cloudflare Version ID 与部署时间；每次 `wrangler deploy`
都会自动生成新版本号，无需手工维护。

---

## 🗄️ 备份与迁移

图片本体在 Telegram，D1 里只有元数据——备份好这一个库即可完整迁移站点。

- **自动备份**：Worker 每天（UTC 19:37，北京 03:37）检查一次，按管理后台设置的频率
  （关闭 / 每天 / 每周 / 每月，默认每周，改后即时生效无需部署）导出 D1。超过 8MB 先 gzip，
  再使用 `BACKUP_ENCRYPTION_KEY`（未设置时回退 `JWT_SECRET`）进行 AES-GCM 加密，最终以
  `.sql[.gz].enc` 发到 Telegram。瞬态验证码、限流桶、缓存和待处理记录不入备份
- **后台管理**：管理后台「数据备份」页签支持立即备份、备份历史（含失败告警记录）、
  历史下载（经 Bot 中转，上限 20MB，超限到频道手动下载）与即时导出到本地
- **手动备份**：`npx wrangler d1 export duckimg --remote --output=./backup.sql`
- **误操作回滚**：D1 自带 Time Travel，可恢复最近 30 天内任意一分钟：
  `npx wrangler d1 time-travel restore duckimg --timestamp=<unix秒>`

恢复频道中的加密备份（解密密钥必须与生成备份时一致）：

```powershell
$env:BACKUP_ENCRYPTION_KEY = Read-Host "备份密钥" -MaskInput
node scripts/decrypt-backup.mjs .\duckimg-backup-YYYY-MM-DD.sql.enc
# 若输出文件以 .gz 结尾，先解压，再执行下方 d1 execute
Remove-Item Env:BACKUP_ENCRYPTION_KEY
```

迁移到新账号 / 新库：

```bash
npx wrangler d1 create duckimg     # 把输出的 database_id 填进 wrangler.toml
npx wrangler d1 migrations apply duckimg --remote
npx wrangler d1 execute duckimg --remote --file=duckimg-backup-YYYY-MM-DD.sql
npx wrangler secret put TG_Bot_Token   # 其余密钥同理（见上方配置说明）
npm run deploy
```

本地手动触发一次备份检查（验证链路；注意本地 dev 用的是本地 D1，密钥来自 `.dev.vars`）：

```bash
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=37+19+*+*+*"
```

---

## 📚 使用说明

1. **注册并登录** — 上传与图库管理通常需要登录（站点可开启强制邮箱验证）
2. **首页上传** — 拖拽 / 选择 / 粘贴图片，复制生成的链接
3. **我的图片** — 管理、搜索、收藏、标签、统计
4. **系统设置** — 切换语言与配色，配置压缩 / 水印等上传偏好
5. **管理后台**（管理员）— 用户、公告、配额、鉴黄与邮件配置

更细的说明见站内 [帮助文档](public/help.html)（部署后路径 `/help.html`）。

---

## 📈 更新日志

### 🔐 [v2.2.1](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.2.1)（2026-08）

- 🔐 SMTP 密码恢复为后台直接配置，并以 `JWT_SECRET` 派生密钥进行 AES-GCM 加密后存入 D1
- 🧩 修复“清除已保存的 SMTP 密码”布局与新密码/清除操作冲突，保留旧 `SMTP_PASSWORD` Secret 兼容回退
- 🛡️ 增加图片真实签名校验、可配置的鉴黄服务异常策略及后台设置参数校验
- ✅ 新增 SMTP 冷启动解密、清除、Secret 迁移、错误密钥等 Workers 回归测试
- 🧹 统一 LF 换行，并逐步采用结构化 Workers 日志

### 🛡️ [v2.2.0](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.2.0)（2026-08）

- 🔐 管理员一次性引导令牌、随机一次性验证码、错误次数限制与 JWT `token_version` 撤销
- 🛡️ 修复旧令牌复活、管理员大小写绕过、XSS 与文件名 / 标签 / 邮箱 / 图片 ID 校验问题
- ⚡ 原子上传配额，限制单次 20 个文件、40MB 文件总量与 50MB 请求体
- 🗄️ D1 Secret 脱敏、Telegram 备份 AES-GCM 加密及本地解密脚本
- ✅ Workers Vitest、GitHub Actions CI、依赖审计、部署 dry-run 与可观测性配置
- 🔖 管理后台显示 Cloudflare Version ID 与部署时间，便于确认线上代码是否更新

### 🗄️ [v2.1.0](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.1.0)（2026-07）

- 🗄️ 元数据存储从 Cloudflare KV 迁移到 D1（SQLite），附一次性迁移脚本
- ⚡ 图库改 SQL 分页 + 单次 batch 聚合统计（总量 / 趋势 / 类型分布），上传去掉全量重读
- ⚡ 热路径优化：用户单查、限流单语句 UPSERT、封禁检查内存缓存、每日 cron 清理过期行
- ✨ 批量图片 API：删除 / 打标签一次 40 张，仪表盘与「清空全部」接入
- ✨ 顶栏公告：后台可发布，头部中间显示，长文自动滚动
- ⚡ 前端：Chart.js 懒加载、站点配置 / 公告 sessionStorage 缓存、滚动节流
- 🐛 修复收藏 / 标签页弹提示栈溢出、仪表盘初始化中断、JWT 认证头打进控制台、
  个人资料统计被截断、后台存储数值写死 MB

### 🎉 [v2.0.0](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.0.0)（2026-07）

- ✨ 设计 tokens + 共享壳（侧栏抽屉、顶栏毛玻璃、scroll lock）
- 🌈 独立配色方案 + 明暗主题
- 🪟 首页上传区透明毛玻璃
- 🌐 全站中英双语
- ⚙️ 设置真功能：压缩 / 质量 / 水印 / EXIF / 登录提醒 / 配额与批量删图
- 📱 移动端布局与抽屉拖拽关闭
- 🧹 移除 premium 叠层 CSS 与死代码

### 🏷️ [v1.0.1](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v1.0.1) / [v1.0.0](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v1.0.0)

- 首次发布：Telegram 图床 + 账户体系 + 基础图库与管理

---

## 🤝 贡献

欢迎 Issue / PR：

1. Fork 本仓库  
2. 新建分支开发  
3. 提交 PR  

提交说明建议：`feat:` / `fix:` / `docs:` / `refactor:` 等。

---

## 📄 开源协议

**GNU AGPL-3.0 with Commons Clause**

- ✅ 使用、修改、分发（需开源修改并保留协议）
- ❌ 禁止商业销售 / 付费托管等 Commons Clause 限制行为  

详见 [LICENSE](LICENSE)。商业合作请通过 [Issues](https://github.com/QCEnjoyLL/DuckImg/issues) 联系。

---

## 🙏 致谢

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Cloudflare Workers](https://workers.cloudflare.com/) / D1
- [Hono](https://hono.dev/)
- [Remix Icon](https://remixicon.com/)
- 上游参考：[xiyewuqiu/new-lmage](https://github.com/xiyewuqiu/new-lmage)

---

<div align="center">

如果这个项目对你有帮助，请点一个 ⭐ Star

[Issues](https://github.com/QCEnjoyLL/DuckImg/issues) · [Releases](https://github.com/QCEnjoyLL/DuckImg/releases) · [v2.2.1](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.2.1)

Made with ❤️ · © 2024–2026 鸭鸭图床 (DuckImg)

</div>
