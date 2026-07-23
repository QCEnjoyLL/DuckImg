<div align="center">

# 🦆 鸭鸭图床 (DuckImg)

<p>
  <img src="logo/鸭鸭.png" alt="鸭鸭图床 Logo" width="120" height="120">
</p>

**基于 Telegram + Cloudflare Workers 的免费图床**

无限存储 · 安全可靠 · 克制现代 UI · 中英双语

<p>
  <a href="https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.0.0"><img src="https://img.shields.io/badge/release-v2.0.0-blue?style=flat-square" alt="v2.0.0"></a>
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
- 头像（上传或粘贴 URL）
- 系统设置：语言、配色、上传偏好、登录邮件提醒、清空本地缓存、删除全部图片
- 管理后台：用户管理、公告、上传上限、鉴黄、邮件与站点配置

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 多页静态 HTML / CSS / JS（无构建器） |
| 后端 | [Hono](https://hono.dev/) on Cloudflare Workers |
| 图片 | Telegram Bot API |
| 元数据 | Cloudflare KV |
| 部署 | Wrangler CLI |

---

## 🚀 快速开始

### 前置

| 工具 | 说明 |
|------|------|
| Cloudflare 账户 | [cloudflare.com](https://cloudflare.com) |
| Telegram Bot | [@BotFather](https://t.me/BotFather) 创建，并准备频道/群 Chat ID |
| Node.js 16+ | [nodejs.org](https://nodejs.org/) |

### 部署

```bash
# 克隆
git clone https://github.com/QCEnjoyLL/DuckImg.git
cd DuckImg

# 安装依赖
npm install

# 登录 Cloudflare
npx wrangler login

# 本地配置（勿提交仓库）
# 复制并编辑 wrangler.toml：填入 TG_Bot_Token、TG_Chat_ID、JWT_SECRET、KV 绑定等

# 创建 KV（若尚未创建）并部署
npm run setup
# 或仅部署：
npm run deploy
```

### 本地开发

```bash
npm run dev
# 默认 http://localhost:8787
```

### 配置说明

`wrangler.toml` **仅本地使用**，已在 `.gitignore` 中，请勿提交密钥。

常见变量：

```toml
[vars]
TG_Bot_Token = "YOUR_BOT_TOKEN"
TG_Chat_ID = "YOUR_CHAT_ID"
JWT_SECRET = "your-secure-jwt-secret"
# 可选：邮件、管理员用户名等按部署说明填写
```

部署成功后由 Cloudflare Workers 提供 HTTPS 访问地址（本项目示例：Workers 路由，非 Pages）。

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
- [Cloudflare Workers](https://workers.cloudflare.com/) / KV
- [Hono](https://hono.dev/)
- [Remix Icon](https://remixicon.com/)
- 上游参考：[xiyewuqiu/new-lmage](https://github.com/xiyewuqiu/new-lmage)

---

<div align="center">

如果这个项目对你有帮助，请点一个 ⭐ Star

[Issues](https://github.com/QCEnjoyLL/DuckImg/issues) · [Releases](https://github.com/QCEnjoyLL/DuckImg/releases) · [v2.0.0](https://github.com/QCEnjoyLL/DuckImg/releases/tag/v2.0.0)

Made with ❤️ · © 2024–2026 鸭鸭图床 (DuckImg)

</div>
