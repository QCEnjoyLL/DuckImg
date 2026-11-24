<div align="center">

<p>
  <img src="logo/鸭鸭.png" alt="鸭鸭图床 Logo" width="96" height="96">
</p>

# 鸭鸭图床 · DuckImg

**基于 Telegram + Cloudflare Workers 的轻量图床**

原图直存 · Studio Gallery 界面 · 中英双语 · 零构建部署

<p>
  <a href="https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.5.0"><img src="https://img.shields.io/badge/release-v2.5.0-18181b?style=flat-square" alt="v2.5.0"></a>
  <a href="https://github.com/QCEnjoyLL/DuckImg/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/QCEnjoyLL/DuckImg/ci.yml?branch=main&style=flat-square&label=CI&color=3f3f46" alt="CI"></a>
  <a href="https://github.com/QCEnjoyLL/DuckImg/stargazers"><img src="https://img.shields.io/github/stars/QCEnjoyLL/DuckImg?style=flat-square&color=52525b" alt="Stars"></a>
  <a href="https://github.com/QCEnjoyLL/DuckImg/network/members"><img src="https://img.shields.io/github/forks/QCEnjoyLL/DuckImg?style=flat-square&color=52525b" alt="Forks"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0%20%2B%20Commons%20Clause-3f3f46?style=flat-square" alt="License"></a>
  <a href="https://telegram.org/"><img src="https://img.shields.io/badge/storage-Telegram-18181b?style=flat-square&logo=telegram&logoColor=white" alt="Telegram"></a>
  <a href="https://workers.cloudflare.com/"><img src="https://img.shields.io/badge/deploy-Cloudflare%20Workers-3f3f46?style=flat-square&logo=cloudflare&logoColor=white" alt="Workers"></a>
</p>

</div>

---

## 设计原则与特性

| 维度 | 说明 |
|---|---|
| **Studio Gallery 视觉** | 暖石浅色画布（`#f7f7f6`）与黑曜石暗色画布（`#0c0c0e`），默认「静墨 Studio」配色并内置 10 套独立主题，让图片本身成为视觉中心 |
| **原图直存** | 通过 Telegram Bot API 以文档方式存储图片，不压缩画质、不改写分辨率 |
| **多端兼容** | 桌面端固定侧边栏与紧凑顶栏，移动端单抽屉手势关闭与安全区适配，全站中英双语 |
| **多途径上传** | 拖拽、点选、`Ctrl+V` 剪贴板粘贴与批量上传，支持生成独立可选短链接 |
| **完整账户与后台** | JWT 会话可撤销、一次性邮箱验证码、每日配额、加密 D1 备份及图片审核管理 |
| **零构建架构** | 前端为原生静态 HTML / CSS / JS，后端基于 Hono on Cloudflare Workers 与 D1 |

---

## 功能概览

### 上传与链接
- 支持拖拽、选择文件、剪贴板粘贴（`Ctrl+V`）及多文件批量上传
- 上传完成后一键复制四种格式：直接链接 / 预览链接 / HTML / Markdown
- 可选客户端预处理：自动压缩、质量档位、右下角文字水印、去除 EXIF 元数据

### 图库与整理
- 「我的图片」支持网格、列表与时间线视图，可选每页显示 20 / 40 / 60 / 100 张
- 支持文件名搜索、标签筛选、收藏夹与拖拽自定义排序
- 支持批量复制链接、批量打标签与批量删除；内置统计面板（图片总数、空间占用与趋势）

### 账户、设置与管理后台
- 账户体系：注册、登录、邮箱验证、修改密码、换绑邮箱与自定义头像
- 安全机制：一次性验证码（哈希存储 + 错误次数限制）与可撤销 JWT（`token_version`）
- 系统设置：语言、独立配色、上传偏好、登录邮件提醒、清空本地缓存、删除全部图片
- 管理后台：用户管理、站点公告、每日上传上限、图片鉴黄、SMTP 邮件、加密备份与站点信息配置
- 鉴黄豁免策略：仅普通用户上传触发图片鉴黄，管理员自动豁免（服务端按数据库实时用户名与 `ADMIN_USERNAME` 判断，不信任前端或 JWT 的 `role`）；所有用户均受文件格式、真实内容签名、大小与封禁校验约束
- 部署指纹：后台页眉自动读取 Cloudflare Version ID 与部署时间，便于核对线上版本

---

## 技术栈

| 层级 | 选型 |
|---|---|
| 前端 | 原生多页静态 HTML / CSS / JS（零构建） |
| 后端 | [Hono](https://hono.dev/) on Cloudflare Workers |
| 图片存储 | Telegram Bot API |
| 元数据 | Cloudflare D1（SQLite） |
| 工程与部署 | Wrangler CLI · Cloudflare Version Metadata · GitHub Actions CI |

---

## 快速开始

### 前置条件

| 工具 | 说明 |
|---|---|
| Cloudflare 账户 | [cloudflare.com](https://cloudflare.com) |
| Telegram Bot | 通过 [@BotFather](https://t.me/BotFather) 创建，并准备存储频道或群组 Chat ID |
| Node.js 22+ | [nodejs.org](https://nodejs.org/) |

### 部署步骤

```bash
# 1. 克隆仓库
git clone https://github.com/QCEnjoyLL/DuckImg.git
cd DuckImg

# 2. 按 lockfile 严格安装依赖，避免本地依赖漂移
npm ci

# 3. 登录 Cloudflare
npx wrangler login

# 4. 首次创建 D1 数据库，并将输出的 database_id 填入 wrangler.toml
npx wrangler d1 create duckimg
npm run migrate

# 5. 配置密钥（完整清单见下方「配置说明」）
npx wrangler secret put TG_Bot_Token

# 6. 部署到 Cloudflare Workers
npm run deploy
```

### 本地开发

```bash
npm run dev
# 默认监听 http://localhost:8787
```

---

## 配置说明

仓库已内置 `wrangler.toml`（包含 D1 绑定与定时备份 Cron，不含任何密钥）；自部署只需替换为你的 `database_id`。

平台级密钥通过 Cloudflare Secrets 持久化保存：

```bash
npx wrangler secret put TG_Bot_Token           # Telegram Bot Token
npx wrangler secret put TG_Chat_ID             # 存储频道 ID
npx wrangler secret put JWT_SECRET             # 登录签名密钥
npx wrangler secret put BACKUP_ENCRYPTION_KEY  # 备份加密密钥，务必离线保存（强烈建议设置）
npx wrangler secret put ADMIN_USERNAME         # 管理员用户名
npx wrangler secret put ADMIN_BOOTSTRAP_TOKEN  # 仅首次注册管理员时临时设置
npx wrangler secret put RESEND_API_KEY         # Resend 邮件服务密钥（可选）
npx wrangler secret put RESEND_FROM            # Resend 发件人（可选）
npx wrangler secret put NSFW_API_KEY           # 鉴黄服务密钥（启用审核时）
npx wrangler secret put NSFW_EXTRA_PARAMS      # 鉴黄服务附加查询参数（可选）
```

> [!IMPORTANT]
> **强烈建议设置 `BACKUP_ENCRYPTION_KEY`。** 未设置时备份会回退使用 `JWT_SECRET` 加密，**任何一次 `JWT_SECRET` 轮换都会使此前所有历史备份永久无法解密**。设置后，备份文件头会附带密钥指纹，在解密校验时即可立即识别密钥是否匹配。

SMTP 密码/授权码可直接在管理后台的「邮件设置」中填写。保存时会使用由 `JWT_SECRET` 派生的 AES-GCM 密钥加密后写入 D1，接口仅返回是否已配置，不回传明文或密文。旧部署中的 `SMTP_PASSWORD` Secret 仍可兼容回退；在后台重新保存密码后将自动切换至 D1 配置。若轮换了 `JWT_SECRET` 或通过备份恢复数据库，需在后台重新输入一次 SMTP 密码。

首次注册管理员账号时，需保证用户名与 `ADMIN_USERNAME` 一致，并在注册请求头携带 `X-Admin-Bootstrap-Token`。创建成功后应立即删除该临时引导密钥：

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

升级已有部署时，请先执行 `npm run migrate` 确保数据库结构已更新，再执行 `npm run deploy`；认证逻辑依赖 `users.token_version` 与 `verification_codes` 表，顺序颠倒会导致登录/验证接口失败。

---

## 可选短链接

上传成功后，原有的直接链接、预览链接、HTML 与 Markdown 保持不变。下方提供独立的「短链接（可选）」区域，点击「生成短链接」后通过 [short](https://github.com/QCEnjoyLL/short) 的 `https://tny.cc.cd/create` 生成当前图片的短直链与短预览链接。批量上传时仅针对当前选中的图片按需生成，切换图片或再次上传会自动清空。

- 短链请求由图床服务端代理转发，无需目标站开放跨域，也不会向浏览器暴露用户 JWT 或创建密码
- 仅限登录用户为自己已写入图库且未被屏蔽的图片生成，单用户每分钟上限 20 次
- 若目标 short 实例启用了创建密码，可通过 `npx wrangler secret put SHORT_LINK_TOKEN` 配置与 `CREATE_TOKEN` 一致的值
- 短链采用 HTTP 302 重定向；若部分论坛或代理不支持跳转，可直接使用上方的原始直链

---

## 备份与迁移

图片文件本体存储在 Telegram，D1 数据库仅保存元数据——备份好 D1 即可完整迁移站点。

- **自动备份**：Worker 每天（UTC 19:37 / 北京时间 03:37）检查一次，按后台设定频率（关闭 / 每天 / 每周 / 每月，默认每周，修改后即时生效）导出 D1。超过 8MB 自动 gzip 压缩，使用 `BACKUP_ENCRYPTION_KEY` 进行 AES-GCM 加密后以 `.sql[.gz].enc` 发送至 Telegram 存储频道（瞬态验证码、限流桶与临时缓存不入备份）
- **后台管理**：管理后台「数据备份」页签支持手动立即备份、查看备份历史与失败告警、下载历史文件（经 Bot 中转上限 20MB，超限可到频道手动下载）及本地导出明文 `.sql`
- **手动备份**：务必导出到仓库目录之外（防止误将含用户邮箱与密码哈希的 `.sql` 提交到 Git）
  ```bash
  npx wrangler d1 export duckimg --remote --output=~/duckimg-backup.sql
  # Windows PowerShell:
  # npx wrangler d1 export duckimg --remote --output=$env:TEMP\duckimg-backup.sql
  ```
- **误操作回滚**：支持利用 D1 Time Travel 恢复最近 30 天内任意时间点：
  ```bash
  npx wrangler d1 time-travel restore duckimg --timestamp=<unix秒>
  ```

### 验证备份可恢复性

建议定期使用内置校验命令完成「拉取历史 -> 从 Telegram 下载 -> 解密 -> 结构校验」全链路测试：

```bash
npm run backup:verify                   # 验证最新一份备份
npm run backup:verify -- --all          # 验证历史中的全部备份
npm run backup:verify -- --no-download  # 仅检查备份记录与时效性（无需密钥）
npm run backup:verify -- --file x.enc   # 校验已手动下载到本地的加密备份
npm run backup:verify -- --selftest     # 离线自测，无需任何凭据
```

| 输出状态 | 说明 |
|---|---|
| `密钥指纹不匹配` | 当前输入的密钥与生成备份时使用的密钥不一致 |
| `指纹不匹配`（提示独立密钥） | 备份由独立密钥加密，请使用 `BACKUP_ENCRYPTION_KEY` |
| 下载报 20MB 上限 | 受限于 Telegram Bot API `getFile` 上限；可手动下载后用 `--file` 校验，或通过 `TG_API_BASE` 接入自建 Bot API |
| 内容校验 FAIL | 备份缺表或数据被截断，需立即重新执行备份 |

> 提示：通过环境变量 `BACKUP_ENCRYPTION_KEY` 传入密钥可避免进入 shell 历史；未设置时脚本会以静默方式提示输入。

### 解密与迁移

解密加密备份（若输出文件以 `.gz` 结尾请先解压）：

```powershell
$env:BACKUP_ENCRYPTION_KEY = Read-Host "备份密钥" -MaskInput
node scripts/decrypt-backup.mjs .\duckimg-backup-YYYY-MM-DD.sql.enc
Remove-Item Env:BACKUP_ENCRYPTION_KEY
```

迁移到新账户或新 D1 数据库：

```bash
npx wrangler d1 create duckimg     # 将输出的 database_id 填入 wrangler.toml
npx wrangler d1 migrations apply duckimg --remote
npx wrangler d1 execute duckimg --remote --file=duckimg-backup-YYYY-MM-DD.sql
npx wrangler secret put TG_Bot_Token   # 按需配置其余密钥
npm run deploy
```

本地验证定时任务链路（使用本地 D1 与 `.dev.vars`）：

```bash
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=37+19+*+*+*"
```

---

## 使用说明

1. **注册与登录** — 上传与图库管理需要登录（站点支持开启强制邮箱验证）
2. **首页上传** — 拖拽、选择文件或 `Ctrl+V` 粘贴上传，一键复制四种链接或可选短链
3. **我的图片** — 在网格 / 列表 / 时间线中管理、搜索、收藏、打标签与查看统计
4. **系统设置** — 切换明暗模式、配色主题、中英语言，配置压缩与水印等客户端偏好
5. **管理后台** — 管理员统一管理用户、公告、每日上限、鉴黄规则、邮件与数据库备份

更多细节请参阅站内 [帮助文档](public/help.html)（部署后访问 `/help.html`）。

---

## 更新日志

### [v2.5.0](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.5.0)（2026-11）

- **Studio Gallery 全站视觉重构**：确立暖石浅色（`#f7f7f6`）与黑曜石深色（`#0c0c0e`）中性画布，新增「静墨 Studio」作为默认主题，并为全部 11 套配色补全高对比度反色 Token（`--text-on-primary`）及悬浮/边框层级
- **修复暗黑模式变量继承冲突**：将暗黑模式自定义属性收口至根节点，不再被 `body.dark-mode` 遮蔽动态切换的配色变量；同步优化浅/深切换时的过渡抑制
- **壳层与共享组件统一**：清除遗留 `menu-system.css` / `header-modern.css` 样式冲突与高饱和渐变装饰，重建统一侧边栏、紧凑顶栏、通知 Toast、公告弹窗、分享面板、图片编辑器与批处理模态框
- **全站页面细节与可访问性打磨**：重构首页点阵托盘上传区、分段式登录卡、画廊网格（修复全部标签胶囊空白文本、支持 `4/3` 画框与 `tabular-nums`）、设置页、管理后台（优化 1440px 桌面表格列宽与审核空状态跨列）、个人资料、帮助文档、收藏夹、标签管理（修复搜索框图标重叠）及屏蔽提示页；统一移动端 `16px` 输入防缩放与无横向溢出布局
- **文档同步**：按 Studio Gallery 风格重写 `README.md`，本次更新仅涉及静态前端与文档，无需修改后端或迁移数据库

<details>
<summary>查看历史版本（v2.4.3 – v1.0.0）</summary>

#### [v2.4.3](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.4.3)（2026-10）
- 管理员上传自动豁免图片鉴黄，不调用外部审核服务；普通用户仍按现有阈值和服务异常策略审核
- 豁免以服务端实时管理员身份为准，不信任前端或 JWT 的 `role`；格式、内容签名、大小校验和账户封禁继续生效
- 新增上传链路回归测试，覆盖管理员豁免、普通用户拦截/放行、鉴黄故障、角色伪装和安全校验；后台注明豁免规则，无需数据库迁移

#### [v2.4.2](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.4.2)（2026-10）
- 图片预览页复用主站设计 tokens、明暗主题和配色管理器，移除写死的紫蓝背景；同源窗口间同步主题和配色变化
- 右上角改为后台配置的 Logo 与站点名称，标题和 favicon 同步品牌；Logo 无法加载时回退本地图片
- 手机端信息面板避让品牌区域，保留全屏、下载及图片信息功能，支持减少动态效果偏好
- 补充品牌安全输出与原生 Worker 预览 HTML 的浏览器回归测试；原始图片直链、上传及短链逻辑不变

#### [v2.4.1](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.4.1)（2026-10）
- 修复短链请求在 Cloudflare Workers 中因不支持 `redirect: 'error'` 而立即失败的问题，改用 `manual` 并拒绝所有非成功响应，仍不跟随跳转
- 增加请求参数原生校验及 301/302/307/308 拒绝回归测试；通过 Cloudflare 远程预览验证同一后端处理函数成功生成真实短直链和短预览链接
- 原上传逻辑、上方原始链接与短链区域界面不变，无需数据库迁移或修改 short 项目

#### [v2.4.0](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.4.0)（2026-10）
- 上传结果下方新增可选短链按钮，接入自建 short 服务，在独立区域展示短直链、短预览链接、HTML 和 Markdown
- 原有上传逻辑和四种链接不变；短链接口校验归属、屏蔽状态与请求频率，限制超时及响应大小，创建密码仅在服务端使用
- 批量切图不会自动缩短，重复生成复用结果；失败只提示短链区，不影响原链接，支持中英文和手机布局
- 新增短链权限、异常处理及前端交互回归测试，无需数据库迁移，也无需修改 short 项目

#### [v2.3.4](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.3.4)（2026-10）
- 修复上传结果中 Markdown 标签左侧的实心色块，去掉旧 CSS 重复装饰，四种链接均保留各自正确的图标
- 增加图标与复制目标的前端回归检查，并在移动端布局断言前等待视口更新

#### [v2.3.3](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.3.3)（2026-10）
- 「我的图片」新增每页数量选择，默认 20 张，可选 20 / 40 / 60 / 100 张，并在当前浏览器记住选择
- 切换数量自动回到第一页，翻页与刷新保留搜索词和标签筛选；防止旧请求覆盖最新结果
- 数量控件支持中英文和手机窄屏布局，无需修改数据库或 API
- 新增分页数量、末页、偏好恢复、筛选保留及请求竞态的前端回归测试

#### [v2.3.2](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.3.2)（2026-10）
- 图片审核拦截改为居中确认弹窗，展示文件名与原因，同时保留上传区提示
- 批量拦截合并提醒，部分成功时不影响成功图片展示；审核服务异常使用独立文案
- 支持键盘关闭、焦点恢复、背景滚动锁和手机窄屏布局，文件名按纯文本安全展示
- 前端回归测试增加审核弹窗场景；同步项目与锁文件版本号，不变更依赖

#### [v2.3.1](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.3.1)（2026-09）
- **补入遗漏的 `migrations/0003_indexes.sql`** 并锚定 `.gitignore` 规则至仓库根目录
- 新增 `v*` tag 触发的 GitHub Actions 自动创建 Release 工作流
- Dependabot 增加全局规则忽略 major 破坏性升级

#### [v2.3.0](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.3.0)（2026-09）
- 修复标签过滤器存储型 XSS、封禁绕过、登录时序枚举、忘记密码响应差异、`changeEmail` 限流与账号维度限流
- 修复删除图片未清边缘缓存及重复上传重置封禁标志；保留含透明像素图片的透明背景
- 备份加密新增密钥指纹校验与 `npm run backup:verify`；新增 `check:deps`、`test:frontend` 与 `0003_indexes` 迁移

#### [v2.2.1](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.2.1)（2026-08）
- SMTP 密码恢复为后台直接配置，使用 `JWT_SECRET` 派生 AES-GCM 密钥加密存储并兼容旧 `SMTP_PASSWORD` Secret
- 增加图片真实签名校验、鉴黄异常策略与结构化 Workers 日志

#### [v2.2.0](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.2.0)（2026-08）
- 新增管理员引导令牌、一次性验证码、JWT `token_version` 撤销与原子上传配额
- 引入 D1 Secret 脱敏、Telegram 备份 AES-GCM 加密及 Workers Vitest / CI

#### [v2.1.0](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.1.0)（2026-07）
- 元数据存储由 KV 迁移至 D1（SQLite），新增批量图片 API、顶栏公告与 Chart.js 懒加载

#### [v2.0.0](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.0.0)（2026-07）
- 引入设计 tokens、共享侧栏壳层、独立配色方案、全站中英双语及设置项完整实现

#### [v1.0.1](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v1.0.1) / [v1.0.0](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v1.0.0)
- 首次发布：Telegram 图床、账户体系与基础图库管理

</details>

---

## 贡献

欢迎通过 Issue 或 Pull Request 参与改进：

1. Fork 本仓库
2. 创建特性分支进行开发
3. 提交 PR（建议提交信息前缀使用 `feat:` / `fix:` / `docs:` / `refactor:`）

---

## 开源协议

**GNU AGPL-3.0 with Commons Clause**

- 允许使用、修改与分发（须开源修改并保留原协议）
- 禁止商业销售、付费托管等受 Commons Clause 限制的商业化行为

完整条款请参阅 [LICENSE](LICENSE)。如有商业合作需求，请通过 [Issues](https://github.com/QCEnjoyLL/DuckImg/issues) 联系。

---

## 致谢

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Cloudflare Workers](https://workers.cloudflare.com/) / D1
- [Hono](https://hono.dev/)
- [Remix Icon](https://remixicon.com/)
- 上游参考：[xiyewuqiu/new-lmage](https://github.com/xiyewuqiu/new-lmage)

---

<div align="center">

[Issues](https://github.com/QCEnjoyLL/DuckImg/issues) · [Releases](https://github.com/QCEnjoyLL/DuckImg/releases) · [v2.5.0](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.5.0)

© 2024–2026 鸭鸭图床 · DuckImg

</div>
