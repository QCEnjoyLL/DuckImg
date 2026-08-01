/**
 * 用户偏好（系统设置）
 * - 本地 localStorage 立即生效
 * - 上传链路读取：压缩 / 质量 / 水印 / 去 EXIF
 * - 可选同步到服务端（loginNotify 等）
 */
(function () {
  'use strict';

  const KEY = 'userSettings';

  const DEFAULTS = {
    darkMode: false,
    language: 'zh-CN',
    animation: true,
    autoCompress: true,
    quality: 'medium',
    watermark: false,
    watermarkText: '鸭鸭图床',
    public: true,
    exif: false,
    loginNotify: false,
    autoClean: false,
  };

  const I18N = {
    'zh-CN': {
      'settings.title': '系统设置',
      'settings.subtitle': '管理您的个人偏好和应用程序设置',
      'settings.appearance': '外观与语言',
      'settings.theme': '明暗主题',
      'settings.theme.desc': '使用右上角开关切换浅色 / 深色',
      'settings.palette': '配色方案',
      'settings.palette.desc': '主色风格，与明暗独立',
      'settings.palette.btn': '选择配色',
      'settings.language': '界面语言',
      'settings.language.desc': '切换后全站文案更新',
      'settings.data': '数据与配额',
      'settings.storage': '云端图片占用',
      'settings.cache': '清空本地缓存',
      'settings.cache.desc': '清除主题/排序等本地记录，不删云端图',
      'settings.cache.btn': '清空',
      'settings.data.note': '图片存在 Telegram；上方为真实统计。删全部见下方危险操作。',
      'settings.upload': '上传与隐私',
      'settings.upload.note': '立即生效：上传前处理图片；登录提醒同步到账户。',
      'settings.compress': '自动压缩',
      'settings.compress.desc': '上传前缩小过大边长',
      'settings.quality': '默认图片质量',
      'settings.quality.desc': 'JPEG 质量 / 边长上限',
      'settings.quality.high': '高质量',
      'settings.quality.medium': '中等质量（推荐）',
      'settings.quality.low': '低质量',
      'settings.watermark': '水印',
      'settings.watermark.desc': '右下角文字水印',
      'settings.watermarkText': '水印文字',
      'settings.watermarkText.desc': '开启水印后生效，可自定义',
      'settings.exif': '保留 EXIF',
      'settings.exif.desc': '关闭则重编码去除拍摄信息',
      'settings.public': '图片公开可见',
      'settings.public.desc': '记录偏好（链接目前仍可访问）',
      'settings.loginNotify': '登录提醒',
      'settings.loginNotify.desc': '当日首次登录发邮件',
      'settings.autoClean': '自动清理本地缓存',
      'settings.autoClean.desc': '进入设置时清理临时键',
      'settings.save': '保存设置',
      'settings.reset': '重置设置',
      'settings.danger': '危险操作',
      'settings.danger.desc': '以下操作将永久删除您的数据，请谨慎操作。',
      'settings.clearCache': '清空缓存',
      'settings.deleteAll': '删除所有图片',
      'settings.deleteAccount': '删除账户',
      'theme.dark': '当前：深色',
      'theme.light': '当前：浅色',
      // menu
      'menu.main': '主要功能',
      'menu.account': '账户中心',
      'menu.more': '更多功能',
      'menu.home': '网站首页',
      'menu.images': '我的图片',
      'menu.favorites': '收藏图片',
      'menu.tags': '标签管理',
      'menu.login': '用户登录',
      'menu.profile': '用户资料',
      'menu.settings': '系统设置',
      'menu.admin': '管理后台',
      'menu.logout': '退出登录',
      'menu.github': '开源仓库',
      'menu.help': '帮助文档',
      'menu.palette': '切换配色',
      'header.upload': '上传图片',
      'header.login': '登录',
      'upload.drop': '拖放图片到这里或',
      'upload.browse': '选择文件',
      'upload.hint.formats': '支持多种图片格式',
      'upload.hint.batch': '支持批量上传',
      'upload.hint.paste': '支持粘贴上传',
      // common chrome
      'common.cancel': '取消',
      'common.save': '保存',
      'common.delete': '删除',
      'common.edit': '编辑',
      'common.copy': '复制',
      'common.copyLink': '复制链接',
      'common.upload': '上传图片',
      'common.uploadNew': '上传新图片',
      'common.stats': '统计信息',
      'common.search': '搜索',
      'common.home': '首页',
      'common.selected': '已选择',
      'common.images': '张图片',
      // gallery
      'gallery.search': '搜索图片名称或标签…',
      'gallery.sort': '排序方式:',
      'gallery.sort.newest': '最新上传',
      'gallery.sort.oldest': '最早上传',
      'gallery.sort.name': '文件名',
      'gallery.sort.size': '文件大小',
      'gallery.sort.custom': '自定义排序',
      'gallery.favoritesOnly': '收藏',
      'gallery.favoritesOnly.title': '只显示收藏',
      'gallery.drag': '拖拽排序',
      'gallery.drag.title': '启用拖拽排序',
      'gallery.view': '视图:',
      'gallery.view.grid': '网格视图',
      'gallery.view.list': '列表视图',
      'gallery.view.timeline': '时间线视图',
      'gallery.empty.title': '还没有上传图片',
      'gallery.empty.text': '上传您的第一张图片，开始使用鸭鸭图床。您可以随时管理、分享和删除图片。',
      'gallery.edit.title': '编辑图片信息',
      'gallery.edit.filename': '文件名',
      'gallery.edit.tags': '标签',
      'gallery.edit.uploaded': '上传时间',
      'gallery.stats.title': '数据统计',
      'gallery.stats.total': '总图片数',
      'gallery.stats.storage': '总存储空间',
      'gallery.stats.recent': '最近上传(7天)',
      'gallery.stats.trend': '上传趋势',
      // favorites
      'fav.search': '搜索收藏的图片…',
      'fav.sort.favorite': '收藏时间',
      'fav.sort.upload': '上传时间',
      'fav.empty.title': '还没有收藏的图片',
      'fav.empty.text': '快去收藏一些喜欢的图片吧！在任何图片上点击星星图标即可收藏。',
      'fav.empty.action': '查看我的图片',
      'fav.unfavorite': '取消收藏',
      'common.cancelSelect': '取消选择',
      'common.copied': '已复制',
      'common.loading': '加载中…',
      'common.prev': '上一页',
      'common.next': '下一页',
      'common.jump': '跳转',
      'common.all': '全部',
      'common.confirm': '确定',
      'common.tag': '标签',
      'gallery.copyTitle': '复制图片链接',
      'gallery.editTitle': '编辑图片信息',
      'gallery.deleteTitle': '删除图片',
      'gallery.fav.add': '收藏图片',
      'gallery.fav.remove': '取消收藏',
      'gallery.fav.added': '已添加到收藏',
      'gallery.fav.removed': '已取消收藏',
      'gallery.empty.fav': '没有收藏的图片',
      'gallery.empty.favText': '您还没有收藏任何图片，点击图片右上角的星标收藏。',
      'gallery.empty.none': '没有图片',
      'gallery.empty.noneText': '上传一些图片开始使用吧！',
      'gallery.delete.confirm': '确定要删除这张图片吗？此操作不可撤销。',
      'gallery.delete.batch': '确定要删除选中的图片吗？此操作不可撤销。',
      'gallery.delete.fail': '删除失败',
      'gallery.update.fail': '更新失败',
      'gallery.name.required': '文件名不能为空',
      'gallery.copied.n': '已复制链接到剪贴板',
      'gallery.tag.prompt': '请输入要添加的标签:',
      'gallery.drag.on.touch': '拖拽已开启：长按图片卡片即可排序',
      'gallery.drag.on': '拖拽已开启：按住卡片左上角六点拖动',
      'gallery.tags.label': '标签:',
      // profile
      'profile.back': '返回图片管理',
      'profile.avatar': '头像管理',
      'profile.avatar.upload': '上传图片',
      'profile.avatar.url': '或粘贴图片链接 https://…',
      'profile.avatar.tips': '支持上传 JPG/PNG（≤5MB），或填写可访问的图片 URL',
      'profile.stats': '使用统计',
      'profile.stats.images': '图片总数',
      'profile.stats.storage': '存储使用',
      'profile.info': '基本信息',
      'profile.username': '用户名',
      'profile.email': '邮箱地址',
      'profile.regTime': '注册时间',
      'profile.lastLogin': '最后登录',
      'profile.security': '账户安全',
      'profile.password': '修改密码',
      'profile.password.cur': '当前密码',
      'profile.password.new': '新密码（至少 6 位）',
      'profile.password.confirm': '确认新密码',
      'profile.password.update': '更新密码',
      'profile.email.change': '修改邮箱',
      'profile.email.new': '新邮箱地址',
      'profile.email.send': '发送验证码到新邮箱',
      'profile.email.code': '输入新邮箱收到的验证码',
      'profile.email.confirm': '确认修改邮箱',
      'profile.actions': '账户操作',
      // admin
      'admin.users': '注册用户',
      'admin.images': '图片总数',
      'admin.verified': '已验证用户',
      'admin.banned': '被封禁',
      'admin.userMgmt': '用户管理',
      'admin.search.user': '搜索用户名 / 邮箱',
      'admin.sort': '排序',
      'admin.pageSize': '每页',
      'admin.selectedUsers': '已选',
      'admin.usersUnit': '个用户',
      'admin.batch.ban': '批量封禁',
      'admin.batch.unban': '批量解封',
      'admin.batch.limit': '批量设上限',
      'admin.batch.delete': '批量删除',
      'admin.col.user': '用户名',
      'admin.col.email': '邮箱',
      'admin.col.created': '注册时间',
      'admin.col.status': '状态',
      'admin.col.images': '图片数',
      'admin.col.limit': '每日上限',
      'admin.col.actions': '操作',
      'admin.audit': '图片审核',
      'admin.ann': '网站公告',
      'admin.ann.save': '保存公告',
      'admin.upload': '上传与验证',
      'admin.upload.save': '保存设置',
      'admin.nsfw.save': '保存鉴黄配置',
      'admin.email.save': '保存邮件配置',
      'admin.site.save': '保存站点设置',
      'admin.recent': '最近上传',
      // tags
      'tags.search': '搜索标签…',
      'tags.all': '全部标签',
      'tags.used': '已使用标签',
      'tags.unused': '未使用标签',
      'tags.sort.name': '按名称排序',
      'tags.sort.count': '按图片数量',
      'tags.sort.date': '按创建时间',
      'tags.sort.color': '按颜色分组',
      'tags.empty.title': '还没有标签',
      'tags.empty.text': '创建您的第一个标签来更好地组织和管理图片。',
      'tags.create': '创建标签',
      'tags.name': '标签名称',
      'tags.desc': '标签描述',
      'tags.name.ph': '输入标签名称…',
      'tags.desc.ph': '输入标签描述（可选）…',
      // auth
      'auth.welcome': '欢迎回来',
      'auth.subtitle': '登录后上传与管理图片',
      'auth.login': '登录',
      'auth.register': '注册',
      'auth.username': '用户名 / 邮箱',
      'auth.password': '密码',
      'auth.regUsername': '用户名',
      'auth.email': '电子邮箱',
      'auth.forgot': '忘记密码？',
      // pages
      'page.home.title': '鸭鸭图床',
      'page.dashboard.title': '我的图片',
      'page.dashboard.sub': '管理、搜索与分享您上传的图片',
      'page.favorites.title': '收藏图片',
      'page.favorites.sub': '管理您收藏的所有图片',
      'page.tags.title': '标签管理',
      'page.tags.sub': '创建和管理您的图片标签',
      'page.profile.title': '用户资料',
      'page.profile.sub': '查看与管理您的账户信息',
      'page.admin.title': '管理后台',
      'page.admin.sub': '用户管理、审核与站点配置',
      'page.help.title': '帮助文档',
      'page.help.sub': '欢迎使用鸭鸭图床！在这里可以找到使用指南、常见问题和技术支持。',
      'page.help.search': '搜索帮助内容…',
      // help
      'help.nav': '导航菜单',
      'help.gettingStarted': '快速开始',
      'help.features': '功能介绍',
      'help.account': '账户与安全',
      'help.faq': '常见问题',
      'help.policy': '合规与隐私',
      'help.contact': '联系我们',
      'help.gs.intro': '鸭鸭图床 是一个基于 Telegram + Cloudflare 的图床服务，让您轻松上传、管理和分享图片。按以下步骤即可上手：',
      'help.gs.1.t': '注册账户',
      'help.gs.1.d': '打开登录页，切换到「注册」，填写用户名、邮箱和密码完成注册。上传需要登录后进行。',
      'help.gs.2.t': '验证邮箱',
      'help.gs.2.d': '注册后系统会向你的邮箱发送 6 位验证码，输入即可完成验证。若站点开启了「强制邮箱验证」，老用户重新登录时也需验证一次（管理员账户免验证）。',
      'help.gs.3.t': '上传图片',
      'help.gs.3.d': '在首页把图片拖到上传区，或点击选择文件；也可以直接 Ctrl+V 粘贴剪贴板里的图片。支持批量上传，JPG / PNG / GIF / WebP 等常见格式。',
      'help.gs.4.t': '复制链接',
      'help.gs.4.d': '上传成功后会生成四种链接：直接链接、预览链接、HTML 代码、Markdown 代码，点对应「复制」按钮即可在任意平台使用。点击预览图还能查看大图。',
      'help.gs.5.t': '管理图片',
      'help.gs.5.d': '在「我的图片」查看、搜索、收藏、打标签或删除你上传的全部图片，并能在「统计信息」中查看总数与占用空间。',
      'help.ft.1.t': '多种上传方式',
      'help.ft.1.d': '拖拽上传、点击选择、批量上传，以及 Ctrl+V 直接粘贴剪贴板图片，怎么顺手怎么来。',
      'help.ft.2.t': '四种分享链接',
      'help.ft.2.d': '上传后一键复制直接链接、预览链接、HTML 代码、Markdown 代码，适配论坛、博客、文档等各种场景。',
      'help.ft.3.t': '多格式 · 原图质量',
      'help.ft.3.d': '支持 JPG、PNG、GIF、WebP 等常见格式；以文档方式存储，尽量保留原图清晰度。',
      'help.ft.4.t': '收藏与标签',
      'help.ft.4.d': '给图片加收藏、打标签，在「收藏图片」「标签管理」中快速归类与查找。',
      'help.ft.5.t': '图片管理与统计',
      'help.ft.5.d': '在「我的图片」搜索、查看大图、删除；「统计信息」展示总数、占用空间、最近上传与上传趋势。',
      'help.ft.6.t': '深色模式 · 响应式',
      'help.ft.6.d': '支持明/暗主题切换，桌面与手机自适应；顶部「公告」按钮可随时查看站点公告。',
      'help.ac.intro': '与账户、邮箱、密码和上传额度相关的设置都在这里。账户安全设置位于「用户资料 → 账户安全」。',
      'help.ac.1.t': '邮箱验证',
      'help.ac.1.d': '注册时需验证邮箱；若站点开启「强制邮箱验证」，老用户重新登录也需验证一次（管理员免验证）。收不到验证码请查看垃圾箱，或点「重新发送」（60 秒冷却）获取最新验证码。',
      'help.ac.2.t': '修改密码',
      'help.ac.2.d': '在「用户资料 → 账户安全」输入当前密码与新密码即可修改，修改后请用新密码重新登录。',
      'help.ac.3.t': '重新绑定邮箱',
      'help.ac.3.d': '输入当前密码与新邮箱，系统会向新邮箱发送验证码，输入验证码确认后完成换绑。',
      'help.ac.4.t': '每日上传上限',
      'help.ac.4.d': '普通用户每天可上传的数量由管理员统一设置（0 表示不限）；管理员也可为单个用户单独设定上限。上传区会实时显示「今日已上传 X / 上限」。',
      'help.ac.5.t': '头像',
      'help.ac.5.d': '在「用户资料」点击头像即可填写头像图片链接进行更换。',
      'help.faq.1.q': '注册后收不到验证码，或一直提示验证失败？',
      'help.faq.1.a': '请先检查邮箱的「垃圾邮件 / 推广」文件夹。验证码为 6 位数字、数分钟内有效；可点弹窗里的「重新发送」（有 60 秒冷却）重新获取最新验证码（旧验证码可能已失效）。如果管理员尚未配置邮件服务，验证码会以提示形式直接显示在页面上（降级模式）。',
      'help.faq.2.q': '登录时提示"请先验证邮箱"怎么办？',
      'help.faq.2.a': '说明站点开启了「强制邮箱验证」。按弹出的输入框填写发送到你邮箱的验证码即可登录；验证一次后即可正常使用。管理员账户无需验证。',
      'help.faq.3.q': '每天能上传多少张？达到上限怎么办？',
      'help.faq.3.a': '每日上传上限由管理员设置（0 表示不限制）。上传区会显示「今日已上传 X / 上限」。达到上限请次日再传，或联系管理员为你单独调整上限。管理员账户不受限制。',
      'help.faq.4.q': '支持哪些格式？有大小限制吗？',
      'help.faq.4.a': '支持 JPG/JPEG、PNG、GIF、WebP 等主流图片格式。图片以「文档」方式存储以尽量保留原图质量；单张大小受 Telegram 限制（通常足够日常使用），过大的文件可能上传失败。',
      'help.faq.5.q': '如何用 Ctrl+V 粘贴上传？',
      'help.faq.5.a': '先用截图工具或在网页上「复制图片」，再回到首页上传区按 Ctrl+V 即可上传。注意：当光标在搜索框、密码框等输入框内时不会触发上传（以免干扰正常文本粘贴）。',
      'help.faq.6.q': '四种链接有什么区别？',
      'help.faq.6.a': '直接链接：图片的直链，可直接嵌入；预览链接：带精美预览页；HTML：img 标签代码；Markdown：![](url) 代码。按需复制对应格式即可。',
      'help.faq.7.q': '删除图片后，链接还能访问吗？',
      'help.faq.7.a': '删除会把图片从你的账户与统计中移除。新上传的图片删除时会同时从 Telegram 删除原文件、直链随即失效；更早的旧图由于 Telegram 仍保存着原文件，其直链可能仍可访问。',
      'help.faq.8.q': '收藏、标签在哪里使用？',
      'help.faq.8.a': '在「我的图片」对单张图片进行收藏、或在编辑里添加标签；随后可在「收藏图片」查看收藏，在「标签管理」按标签聚合查看，点击某标签会跳到「我的图片」按该标签筛选。',
      'help.faq.9.q': '如何修改密码或重新绑定邮箱？',
      'help.faq.9.a': '进入「用户资料 → 账户安全」：修改密码需输入当前密码；换绑邮箱需输入密码并向新邮箱发送验证码确认。忘记密码且无法登录时，请联系管理员协助。',
      'help.faq.10.q': '为什么我的图片上传被拦截了？',
      'help.faq.10.a': '若管理员启用了「图片鉴黄」，命中违规内容的图片会在上传时被自动拦截、不予保存。请遵守站点的内容规范（详见「合规与隐私」）。',
      'help.faq.11.q': '能批量管理吗？',
      'help.faq.11.a': '可以。在「我的图片」可对图片进行删除、复制链接、打标签等操作；管理员在后台还能对用户进行批量封禁/解封/设上限/删除等管理。',
      'help.pol.intro': '请在使用前阅读以下内容规范。上传即视为同意本规范，并对所上传内容承担全部法律责任。',
      'help.pol.warn1': '严禁上传任何违反法律法规的内容，包括但不限于：色情淫秽、暴力恐怖、血腥、涉政违规、赌博诈骗、侵犯他人隐私 / 肖像 / 版权等违法或不良信息。',
      'help.pol.warn2': '本站对上传内容进行机器审核（鉴黄）与人工抽查；一经发现违规，将立即删除并封禁账号，情节严重者保留向有关部门举报的权利。',
      'help.pol.1': '请勿上传重要或隐私文件，并请自行做好备份；图床不承诺作为唯一存储。',
      'help.pol.2': '图片直链对持有链接者可见，请勿用于存放敏感、私密内容。',
      'help.pol.3': '管理员可查看与清理用户上传的内容，以维护合规与安全。',
      'help.pol.4': '因违规上传导致的一切后果由上传者自行承担，与本站无关。',
      'help.ct.intro': '使用中遇到问题、或有建议与反馈，欢迎通过以下方式联系：',
      'help.ct.1.t': 'GitHub',
      'help.ct.1.d': '提交 Issue 反馈问题或建议',
      'help.ct.2.t': '联系管理员',
      'help.ct.2.d': '账号、上限、违规申诉等请联系站点管理员',
      'help.ct.3.t': '站点公告',
      'help.ct.3.d': '点击顶部「公告」按钮查看最新通知',
    },
    'en-US': {
      'settings.title': 'Settings',
      'settings.subtitle': 'Manage preferences and app options',
      'settings.appearance': 'Appearance & Language',
      'settings.theme': 'Light / Dark',
      'settings.theme.desc': 'Use the top-right switch for light or dark mode',
      'settings.palette': 'Color palette',
      'settings.palette.desc': 'Accent colors, independent of light/dark',
      'settings.palette.btn': 'Choose palette',
      'settings.language': 'Language',
      'settings.language.desc': 'Updates site text immediately',
      'settings.data': 'Data & Quota',
      'settings.storage': 'Cloud storage used',
      'settings.cache': 'Clear local cache',
      'settings.cache.desc': 'Clears theme/sort prefs, not cloud images',
      'settings.cache.btn': 'Clear',
      'settings.data.note': 'Images are stored on Telegram. Real stats above. Danger zone below for bulk delete.',
      'settings.upload': 'Upload & Privacy',
      'settings.upload.note': 'Applied before upload. Login alerts sync to your account.',
      'settings.compress': 'Auto compress',
      'settings.compress.desc': 'Downscale large images before upload',
      'settings.quality': 'Default quality',
      'settings.quality.desc': 'JPEG quality / max edge length',
      'settings.quality.high': 'High',
      'settings.quality.medium': 'Medium (recommended)',
      'settings.quality.low': 'Low',
      'settings.watermark': 'Watermark',
      'settings.watermark.desc': 'Text watermark at bottom-right',
      'settings.watermarkText': 'Watermark text',
      'settings.watermarkText.desc': 'Used when watermark is on',
      'settings.exif': 'Keep EXIF',
      'settings.exif.desc': 'Off = re-encode and strip metadata',
      'settings.public': 'Public by default',
      'settings.public.desc': 'Preference only (links still work for now)',
      'settings.loginNotify': 'Login alerts',
      'settings.loginNotify.desc': 'Email on first login each day',
      'settings.autoClean': 'Auto-clean local cache',
      'settings.autoClean.desc': 'Cleans temp keys when opening settings',
      'settings.save': 'Save',
      'settings.reset': 'Reset',
      'settings.danger': 'Danger zone',
      'settings.danger.desc': 'These actions permanently delete data.',
      'settings.clearCache': 'Clear cache',
      'settings.deleteAll': 'Delete all images',
      'settings.deleteAccount': 'Delete account',
      'theme.dark': 'Now: Dark',
      'theme.light': 'Now: Light',
      'menu.main': 'Main',
      'menu.account': 'Account',
      'menu.more': 'More',
      'menu.home': 'Home',
      'menu.images': 'My Images',
      'menu.favorites': 'Favorites',
      'menu.tags': 'Tags',
      'menu.login': 'Log in',
      'menu.profile': 'Profile',
      'menu.settings': 'Settings',
      'menu.admin': 'Admin',
      'menu.logout': 'Log out',
      'menu.github': 'GitHub',
      'menu.help': 'Help',
      'menu.palette': 'Color palette',
      'header.upload': 'Upload',
      'header.login': 'Log in',
      'upload.drop': 'Drop images here or ',
      'upload.browse': 'browse',
      'upload.hint.formats': 'Common image formats',
      'upload.hint.batch': 'Batch upload',
      'upload.hint.paste': 'Paste to upload',
      'common.cancel': 'Cancel',
      'common.save': 'Save',
      'common.delete': 'Delete',
      'common.edit': 'Edit',
      'common.copy': 'Copy',
      'common.copyLink': 'Copy link',
      'common.upload': 'Upload',
      'common.uploadNew': 'Upload new',
      'common.stats': 'Stats',
      'common.search': 'Search',
      'common.home': 'Home',
      'common.selected': 'Selected',
      'common.images': 'images',
      'gallery.search': 'Search name or tags…',
      'gallery.sort': 'Sort:',
      'gallery.sort.newest': 'Newest',
      'gallery.sort.oldest': 'Oldest',
      'gallery.sort.name': 'Name',
      'gallery.sort.size': 'Size',
      'gallery.sort.custom': 'Custom order',
      'gallery.favoritesOnly': 'Favorites',
      'gallery.favoritesOnly.title': 'Show favorites only',
      'gallery.drag': 'Drag sort',
      'gallery.drag.title': 'Enable drag sorting',
      'gallery.view': 'View:',
      'gallery.view.grid': 'Grid',
      'gallery.view.list': 'List',
      'gallery.view.timeline': 'Timeline',
      'gallery.empty.title': 'No images yet',
      'gallery.empty.text': 'Upload your first image to get started. Manage, share and delete anytime.',
      'gallery.edit.title': 'Edit image',
      'gallery.edit.filename': 'Filename',
      'gallery.edit.tags': 'Tags',
      'gallery.edit.uploaded': 'Uploaded',
      'gallery.stats.title': 'Statistics',
      'gallery.stats.total': 'Total images',
      'gallery.stats.storage': 'Total storage',
      'gallery.stats.recent': 'Last 7 days',
      'gallery.stats.trend': 'Upload trend',
      'fav.search': 'Search favorites…',
      'fav.sort.favorite': 'Favorited',
      'fav.sort.upload': 'Uploaded',
      'fav.empty.title': 'No favorites yet',
      'fav.empty.text': 'Tap the star on any image to favorite it.',
      'fav.empty.action': 'My Images',
      'fav.unfavorite': 'Unfavorite',
      'common.cancelSelect': 'Deselect',
      'common.copied': 'Copied',
      'common.loading': 'Loading…',
      'common.prev': 'Prev',
      'common.next': 'Next',
      'common.jump': 'Go',
      'common.all': 'All',
      'common.confirm': 'OK',
      'common.tag': 'Tags',
      'gallery.copyTitle': 'Copy image link',
      'gallery.editTitle': 'Edit image',
      'gallery.deleteTitle': 'Delete image',
      'gallery.fav.add': 'Favorite',
      'gallery.fav.remove': 'Unfavorite',
      'gallery.fav.added': 'Added to favorites',
      'gallery.fav.removed': 'Removed from favorites',
      'gallery.empty.fav': 'No favorites',
      'gallery.empty.favText': 'Star an image to add it to favorites.',
      'gallery.empty.none': 'No images',
      'gallery.empty.noneText': 'Upload some images to get started.',
      'gallery.delete.confirm': 'Delete this image? This cannot be undone.',
      'gallery.delete.batch': 'Delete selected images? This cannot be undone.',
      'gallery.delete.fail': 'Delete failed',
      'gallery.update.fail': 'Update failed',
      'gallery.name.required': 'Filename is required',
      'gallery.copied.n': 'Links copied to clipboard',
      'gallery.tag.prompt': 'Enter a tag to add:',
      'gallery.drag.on.touch': 'Drag on: long-press a card to reorder',
      'gallery.drag.on': 'Drag on: grab the handle at top-left',
      'gallery.tags.label': 'Tags:',
      'profile.back': 'Back to images',
      'profile.avatar': 'Avatar',
      'profile.avatar.upload': 'Upload image',
      'profile.avatar.url': 'Or paste image URL https://…',
      'profile.avatar.tips': 'JPG/PNG ≤5MB, or a public image URL',
      'profile.stats': 'Usage',
      'profile.stats.images': 'Images',
      'profile.stats.storage': 'Storage',
      'profile.info': 'Basic info',
      'profile.username': 'Username',
      'profile.email': 'Email',
      'profile.regTime': 'Joined',
      'profile.lastLogin': 'Last login',
      'profile.security': 'Security',
      'profile.password': 'Change password',
      'profile.password.cur': 'Current password',
      'profile.password.new': 'New password (min 6)',
      'profile.password.confirm': 'Confirm new password',
      'profile.password.update': 'Update password',
      'profile.email.change': 'Change email',
      'profile.email.new': 'New email',
      'profile.email.send': 'Send code to new email',
      'profile.email.code': 'Enter the code from the new email',
      'profile.email.confirm': 'Confirm email change',
      'profile.actions': 'Account actions',
      'admin.users': 'Users',
      'admin.images': 'Images',
      'admin.verified': 'Verified',
      'admin.banned': 'Banned',
      'admin.userMgmt': 'User management',
      'admin.search.user': 'Search username / email',
      'admin.sort': 'Sort',
      'admin.pageSize': 'Per page',
      'admin.selectedUsers': 'Selected',
      'admin.usersUnit': 'users',
      'admin.batch.ban': 'Ban',
      'admin.batch.unban': 'Unban',
      'admin.batch.limit': 'Set limit',
      'admin.batch.delete': 'Delete',
      'admin.col.user': 'User',
      'admin.col.email': 'Email',
      'admin.col.created': 'Joined',
      'admin.col.status': 'Status',
      'admin.col.images': 'Images',
      'admin.col.limit': 'Daily limit',
      'admin.col.actions': 'Actions',
      'admin.audit': 'Moderation',
      'admin.ann': 'Announcements',
      'admin.ann.save': 'Save announcement',
      'admin.upload': 'Upload & verification',
      'admin.upload.save': 'Save settings',
      'admin.nsfw.save': 'Save NSFW config',
      'admin.email.save': 'Save email config',
      'admin.site.save': 'Save site settings',
      'admin.recent': 'Recent uploads',
      'tags.search': 'Search tags…',
      'tags.all': 'All tags',
      'tags.used': 'Used',
      'tags.unused': 'Unused',
      'tags.sort.name': 'By name',
      'tags.sort.count': 'By count',
      'tags.sort.date': 'By date',
      'tags.sort.color': 'By color',
      'tags.empty.title': 'No tags yet',
      'tags.empty.text': 'Create your first tag to organize images.',
      'tags.create': 'Create tag',
      'tags.name': 'Tag name',
      'tags.desc': 'Description',
      'tags.name.ph': 'Tag name…',
      'tags.desc.ph': 'Optional description…',
      'auth.welcome': 'Welcome back',
      'auth.subtitle': 'Sign in to upload and manage images',
      'auth.login': 'Log in',
      'auth.register': 'Register',
      'auth.username': 'Username / email',
      'auth.password': 'Password',
      'auth.regUsername': 'Username',
      'auth.email': 'Email',
      'auth.forgot': 'Forgot password?',
      'page.home.title': 'DuckImg',
      'page.dashboard.title': 'My Images',
      'page.dashboard.sub': 'Manage, search and share your uploads',
      'page.favorites.title': 'Favorites',
      'page.favorites.sub': 'Manage all favorited images',
      'page.tags.title': 'Tags',
      'page.tags.sub': 'Create and manage image tags',
      'page.profile.title': 'Profile',
      'page.profile.sub': 'View and manage your account',
      'page.admin.title': 'Admin',
      'page.admin.sub': 'Users, moderation and site config',
      'page.help.title': 'Help',
      'page.help.sub': 'Guides, FAQ and support for DuckImg.',
      'page.help.search': 'Search help…',
      'help.nav': 'Navigation',
      'help.gettingStarted': 'Getting started',
      'help.features': 'Features',
      'help.account': 'Account & security',
      'help.faq': 'FAQ',
      'help.policy': 'Policy & privacy',
      'help.contact': 'Contact',
      'help.gs.intro': 'DuckImg is an image host built on Telegram + Cloudflare. Upload, manage and share images easily. Follow these steps:',
      'help.gs.1.t': 'Create an account',
      'help.gs.1.d': 'Open the login page, switch to Register, and enter username, email and password. Upload requires login.',
      'help.gs.2.t': 'Verify email',
      'help.gs.2.d': 'Enter the 6-digit code sent to your email. If email verification is required, re-login may also need verification (admins exempt).',
      'help.gs.3.t': 'Upload images',
      'help.gs.3.d': 'On the home page, drag files into the dropzone, pick files, or paste with Ctrl+V. Batch upload and JPG/PNG/GIF/WebP are supported.',
      'help.gs.4.t': 'Copy links',
      'help.gs.4.d': 'After upload you get four links: direct, preview, HTML and Markdown. Copy any of them for use elsewhere. Click the preview to view full size.',
      'help.gs.5.t': 'Manage images',
      'help.gs.5.d': 'In My Images, search, favorite, tag or delete your uploads, and check totals and storage in Stats.',
      'help.ft.1.t': 'Multiple upload methods',
      'help.ft.1.d': 'Drag-drop, file picker, batch upload, and Ctrl+V clipboard paste — use whatever fits.',
      'help.ft.2.t': 'Four share formats',
      'help.ft.2.d': 'One-click copy for direct link, preview, HTML and Markdown — forums, blogs and docs.',
      'help.ft.3.t': 'Formats & quality',
      'help.ft.3.d': 'JPG, PNG, GIF, WebP and more; stored as documents to keep clarity when possible.',
      'help.ft.4.t': 'Favorites & tags',
      'help.ft.4.d': 'Favorite and tag images; browse them in Favorites and Tags.',
      'help.ft.5.t': 'Management & stats',
      'help.ft.5.d': 'Search, full-size preview and delete in My Images; Stats show totals, storage, recent uploads and trends.',
      'help.ft.6.t': 'Theme & responsive',
      'help.ft.6.d': 'Light/dark themes, desktop and mobile layout; open Announcements from the header anytime.',
      'help.ac.intro': 'Account, email, password and upload quota settings live here. Security options are under Profile → Account security.',
      'help.ac.1.t': 'Email verification',
      'help.ac.1.d': 'Registration requires email verification. If forced verification is on, returning users also verify once on login (admins exempt). Check spam if the code is missing, or resend (60s cooldown).',
      'help.ac.2.t': 'Change password',
      'help.ac.2.d': 'Under Profile → Account security, enter current and new password, then sign in again with the new one.',
      'help.ac.3.t': 'Rebind email',
      'help.ac.3.d': 'Enter current password and the new email; confirm with the code sent to the new address.',
      'help.ac.4.t': 'Daily upload limit',
      'help.ac.4.d': 'Admins set a site-wide daily limit (0 = unlimited) and can override per user. The uploader shows “Uploaded today X / limit”.',
      'help.ac.5.t': 'Avatar',
      'help.ac.5.d': 'On Profile, click the avatar and paste an image URL to change it.',
      'help.faq.1.q': 'No verification code, or verification keeps failing?',
      'help.faq.1.a': 'Check spam/promotions. Codes are 6 digits and expire quickly; use Resend in the dialog (60s cooldown). If mail is not configured, the code may appear on the page as a fallback.',
      'help.faq.2.q': 'Login says “verify email first”?',
      'help.faq.2.a': 'Forced email verification is on. Enter the code from your inbox once; admins skip this.',
      'help.faq.3.q': 'Daily upload limit?',
      'help.faq.3.a': 'Set by admins (0 = unlimited). The uploader shows today’s count. Wait until tomorrow or ask an admin for a higher limit. Admins are unrestricted.',
      'help.faq.4.q': 'Formats and size limits?',
      'help.faq.4.a': 'JPG/JPEG, PNG, GIF, WebP and similar. Stored as documents for quality; Telegram caps single-file size — very large files may fail.',
      'help.faq.5.q': 'How do I paste-upload with Ctrl+V?',
      'help.faq.5.a': 'Copy an image (screenshot or “copy image”), then focus the home uploader and press Ctrl+V. Paste is ignored while typing in inputs so normal text paste still works.',
      'help.faq.6.q': 'What are the four link types?',
      'help.faq.6.a': 'Direct: raw image URL; Preview: styled preview page; HTML: img tag; Markdown: ![](url). Copy what you need.',
      'help.faq.7.q': 'Can links still work after delete?',
      'help.faq.7.a': 'Delete removes the image from your account and stats. Newer uploads are also removed from Telegram so the link dies; older files may still resolve if Telegram still holds the file.',
      'help.faq.8.q': 'Where are favorites and tags?',
      'help.faq.8.a': 'Favorite or tag from My Images; browse Favorites and Tags. Clicking a tag filters My Images.',
      'help.faq.9.q': 'Change password or rebind email?',
      'help.faq.9.a': 'Profile → Account security: password needs the current one; email rebind needs a password and a code to the new address. If locked out, contact an admin.',
      'help.faq.10.q': 'Why was my upload blocked?',
      'help.faq.10.a': 'If NSFW scanning is enabled, violating images are rejected at upload. See Policy & privacy.',
      'help.faq.11.q': 'Batch management?',
      'help.faq.11.a': 'Yes — delete, copy links and tag in My Images. Admins can bulk ban/unban, set limits and delete users.',
      'help.pol.intro': 'Please read before uploading. Uploading means you accept these rules and take full legal responsibility for your content.',
      'help.pol.warn1': 'Do not upload illegal content, including but not limited to pornography, violence, gore, political violations, fraud, or content that infringes privacy, likeness or copyright.',
      'help.pol.warn2': 'Uploads may be scanned automatically and spot-checked by humans. Violations are removed and accounts banned; serious cases may be reported to authorities.',
      'help.pol.1': 'Do not rely on the host as sole storage for important or private files; keep your own backups.',
      'help.pol.2': 'Direct links are visible to anyone who has them — do not store sensitive content.',
      'help.pol.3': 'Admins may review and clean uploads to keep the site safe and compliant.',
      'help.pol.4': 'Consequences of illegal uploads fall on the uploader, not the site.',
      'help.ct.intro': 'Need help or have feedback? Reach us here:',
      'help.ct.1.t': 'GitHub',
      'help.ct.1.d': 'Open an Issue for bugs or ideas',
      'help.ct.2.t': 'Site admin',
      'help.ct.2.d': 'Account, quota and appeal requests go to the site admin',
      'help.ct.3.t': 'Announcements',
      'help.ct.3.d': 'Use the header Announcements button for latest notices',
    },
  };

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  function write(partial) {
    const next = { ...read(), ...partial };
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('userPrefsChanged', { detail: next }));
    return next;
  }

  function get(key) {
    const all = read();
    return key == null ? all : all[key];
  }

  function qualityToJpeg(q) {
    if (q === 'high') return 0.92;
    if (q === 'low') return 0.62;
    return 0.78;
  }

  function maxEdgeForQuality(q) {
    if (q === 'high') return 4096;
    if (q === 'low') return 1600;
    return 2560;
  }

  async function processImageFile(file, prefs) {
    if (!file || !file.type || !file.type.startsWith('image/')) return file;
    if (file.type === 'image/svg+xml') return file;

    const p = prefs || read();
    const needProcess = p.autoCompress || p.watermark || !p.exif;
    if (!needProcess && p.quality === 'high') return file;

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (_) {
      return file;
    }

    try {
      let w = bitmap.width;
      let h = bitmap.height;
      const maxEdge = p.autoCompress ? maxEdgeForQuality(p.quality) : Math.max(w, h);
      if (p.autoCompress && Math.max(w, h) > maxEdge) {
        const scale = maxEdge / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, w, h);

      if (p.watermark) {
        const text = String(p.watermarkText || '鸭鸭图床').trim() || '鸭鸭图床';
        const fontSize = Math.max(14, Math.round(Math.min(w, h) * 0.04));
        ctx.save();
        ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = Math.max(1, fontSize / 12);
        const pad = Math.round(fontSize * 0.6);
        const metrics = ctx.measureText(text);
        const x = w - metrics.width - pad;
        const y = h - pad;
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
        ctx.restore();
      }

      if (p.exif && !p.autoCompress && !p.watermark && p.quality === 'high') {
        bitmap.close && bitmap.close();
        return file;
      }

      const mime = file.type === 'image/png' && !p.autoCompress ? 'image/png' : 'image/jpeg';
      const quality = mime === 'image/jpeg' ? qualityToJpeg(p.quality) : undefined;

      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), mime, quality);
      });

      bitmap.close && bitmap.close();
      if (!blob) return file;

      const base = (file.name || 'image').replace(/\.[^.]+$/, '');
      const ext = mime === 'image/png' ? 'png' : 'jpg';
      return new File([blob], `${base}.${ext}`, { type: mime, lastModified: Date.now() });
    } catch (e) {
      console.warn('图片预处理失败，使用原文件', e);
      try { bitmap && bitmap.close && bitmap.close(); } catch (_) {}
      return file;
    }
  }

  async function processFiles(fileList) {
    const prefs = read();
    const arr = Array.from(fileList || []);
    const out = [];
    for (const f of arr) out.push(await processImageFile(f, prefs));
    return out;
  }

  function runAutoClean() {
    const p = read();
    if (!p.autoClean) return;
    const keep = new Set(['token', 'user', 'menuState', KEY, 'theme', 'themePalette', 'dragMode', 'viewMode', 'customImageOrder']);
    const remove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (keep.has(k)) continue;
      if (k.startsWith('announcement')) continue;
      if (/^(scroll|cache|tmp|batch)/i.test(k) || k.includes('Position')) remove.push(k);
    }
    remove.forEach((k) => localStorage.removeItem(k));
  }

  function t(key, lang) {
    const code = I18N[lang] ? lang : 'zh-CN';
    const dict = I18N[code] || I18N['zh-CN'];
    return dict[key] || (I18N['zh-CN'][key] || key);
  }

  function applyLanguage(lang) {
    const code = I18N[lang] ? lang : 'zh-CN';
    document.documentElement.setAttribute('lang', code === 'zh-CN' ? 'zh-CN' : 'en');
    document.documentElement.setAttribute('data-lang', code);

    // 通用：所有带 data-i18n 的节点
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const val = t(key, code);
      if (!val) return;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.hasAttribute('placeholder') || el.getAttribute('data-i18n-attr') === 'placeholder') {
          el.placeholder = val;
        } else {
          el.value = val;
        }
      } else {
        // 保留子图标
        const icon = el.querySelector(':scope > i, :scope > .menu-item-icon, :scope > svg');
        const icons = Array.from(el.querySelectorAll(':scope > i, :scope > svg')).filter((n) => n.parentElement === el);
        el.textContent = '';
        icons.forEach((n) => el.appendChild(n));
        if (icons.length) el.appendChild(document.createTextNode(' ' + val));
        else el.textContent = val;
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      const val = t(key, code);
      if (val) el.placeholder = val;
    });

    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      const val = t(key, code);
      if (val) el.title = val;
    });

    // 设置页特殊节点
    const title = document.querySelector('.settings-title');
    if (title) {
      const icon = title.querySelector('i');
      title.textContent = '';
      if (icon) title.appendChild(icon);
      title.appendChild(document.createTextNode(' ' + t('settings.title', code)));
    }
    const sub = document.querySelector('.settings-header p');
    if (sub && !sub.hasAttribute('data-i18n')) sub.textContent = t('settings.subtitle', code);

    const mapBtn = [
      ['clearCacheBtn', 'settings.clearCache'],
      ['deleteAllBtn', 'settings.deleteAll'],
      ['deleteAccountBtn', 'settings.deleteAccount'],
      ['clearCacheQuickBtn', 'settings.cache.btn'],
      ['openPaletteBtn', 'settings.palette.btn'],
      ['saveBtn', 'settings.save'],
      ['resetBtn', 'settings.reset'],
    ];
    mapBtn.forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const ic = el.querySelector('i');
      el.textContent = '';
      if (ic) {
        el.appendChild(ic);
        el.appendChild(document.createTextNode(' ' + t(key, code)));
      } else el.textContent = t(key, code);
    });

    const dangerTitle = document.querySelector('.danger-zone-title');
    if (dangerTitle) {
      const ic = dangerTitle.querySelector('i');
      dangerTitle.textContent = '';
      if (ic) dangerTitle.appendChild(ic);
      dangerTitle.appendChild(document.createTextNode(' ' + t('settings.danger', code)));
    }
    const dangerDesc = document.querySelector('.danger-zone > p');
    if (dangerDesc) dangerDesc.textContent = t('settings.danger.desc', code);

    const hint = document.getElementById('themeModeHint');
    if (hint) {
      const dark = document.documentElement.classList.contains('dark-mode') || document.body.classList.contains('dark-mode');
      hint.textContent = t(dark ? 'theme.dark' : 'theme.light', code);
    }

    // 页头标题（各页 hero；已有 data-i18n 的跳过，避免拆掉内部 span）
    const pageMap = [
      ['.dashboard-title', 'page.dashboard.title'],
      ['.favorites-title', 'page.favorites.title'],
      ['.tags-title', 'page.tags.title'],
      ['.profile-title', 'page.profile.title'],
      ['.admin-title', 'page.admin.title'],
      ['.help-title', 'page.help.title'],
    ];
    pageMap.forEach(([sel, key]) => {
      const el = document.querySelector(sel);
      if (!el) return;
      if (el.hasAttribute('data-i18n') || el.querySelector('[data-i18n]')) return;
      const ic = el.querySelector('i');
      el.textContent = '';
      if (ic) el.appendChild(ic);
      el.appendChild(document.createTextNode(' ' + t(key, code)));
    });
    const pageSubMap = [
      ['.dashboard-header p', 'page.dashboard.sub'],
      ['.favorites-header p', 'page.favorites.sub'],
      ['.tags-header p', 'page.tags.sub'],
      ['.profile-header p', 'page.profile.sub'],
      ['.admin-header p', 'page.admin.sub'],
      ['.help-subtitle', 'page.help.sub'],
    ];
    pageSubMap.forEach(([sel, key]) => {
      const el = document.querySelector(sel);
      if (el && !el.hasAttribute('data-i18n')) el.textContent = t(key, code);
    });

    // 顶栏上传按钮 title
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) uploadBtn.title = t('header.upload', code);
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
      const span = loginBtn.querySelector('span');
      if (span) span.textContent = t('header.login', code);
      else {
        const ic = loginBtn.querySelector('i');
        loginBtn.textContent = '';
        if (ic) loginBtn.appendChild(ic);
        loginBtn.appendChild(document.createTextNode(' ' + t('header.login', code)));
      }
    }

    // 设置页质量下拉
    const qualitySelect = document.getElementById('qualitySelect');
    if (qualitySelect) {
      const map = { high: 'settings.quality.high', medium: 'settings.quality.medium', low: 'settings.quality.low' };
      Array.from(qualitySelect.options).forEach((opt) => {
        const key = map[opt.value];
        if (key) opt.textContent = t(key, code);
      });
    }

    // 图库排序下拉
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
      const map = {
        newest: 'gallery.sort.newest',
        oldest: 'gallery.sort.oldest',
        name: 'gallery.sort.name',
        size: 'gallery.sort.size',
        custom: 'gallery.sort.custom',
      };
      Array.from(sortSelect.options).forEach((opt) => {
        const key = map[opt.value];
        if (key) opt.textContent = t(key, code);
      });
    }

    // 通知其它脚本
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: code } }));
  }

  async function syncToServer(prefs) {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      await fetch('/api/auth/prefs', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          loginNotify: !!prefs.loginNotify,
          public: prefs.public !== false,
          language: prefs.language || 'zh-CN',
        }),
      });
    } catch (_) {}
  }

  function init() {
    const prefs = read();
    applyLanguage(prefs.language);
    runAutoClean();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.UserPrefs = {
    get,
    set: write,
    read,
    processImageFile,
    processFiles,
    applyLanguage,
    syncToServer,
    runAutoClean,
    t,
    DEFAULTS,
    I18N,
  };
})();
