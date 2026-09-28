# 洛斯百年 · 抖音文案生成（独立 Cloudflare 项目）

任何人打开链接 → AI 生成抖音文案 → 复制文案、保存素材 → **用户自己手动发到抖音**。
**不模拟登录、不碰 Cookie、不调抖音接口、不需要企业认证、没有风控**。

> 和小红书包是**平级的两个独立项目**，部署方式完全一致：一个 Cloudflare Pages 项目 + 一个独立域名。
> 小红书那版是「生成文案 + 复制 + 手动发」，本版抖音也是同一套逻辑，只是文案风格调成了抖音口吻。

---

## 它和小红书那版有什么不同 / 相同

| | 小红书工具 | 本抖音工具 |
|---|---|---|
| 部署 | Cloudflare Pages + 自定义域名 | 同左（另一个独立项目 + 独立域名） |
| 文案生成 | DeepSeek（Cloudflare Function） | 同左 |
| 发布方式 | 生成文案 + 复制 + 手动发 | **同左**：生成文案 + 复制 + 手动发 |
| 企业认证 | 不需要 | 不需要 |
| 素材 | 页面展示/下载，手动添加 | 同左 |

---

## 项目结构

```
douyin-publisher/
├── functions/api/
│   ├── generate-douyin.js   # 抖音文案生成（调 DeepSeek，密钥只在服务端）
│   └── used-images.js       # 全局「图片已用记录」接口（Cloudflare KV，防重复）
├── public/
│   ├── douyin.html          # 对外页面：选门店 → 生成文案 → 复制 → 下载素材
│   ├── media.config.js      # 【你改这里】两家店分开配置（素材/话题标签/关键词）
│   └── media/               # 把素材文件放这里（a-cover1~3.jpg / b-cover1~3.jpg ...）
├── wrangler.toml           # KV 绑定配置（图片防重复用）
└── README.md
```

---

## 部署步骤（Cloudflare Pages，无框架，和小红书一模一样）

### 1. 推到 Git 并连接 Cloudflare Pages
- 构建命令：**留空**（不需要 build）
- 输出目录：`public`
- 根目录：`/`

### 2. 配置 Secret（Cloudflare 后台 → 该项目 → Settings → Environment Variables → Production）
| 变量名 | 值 |
|---|---|
| `DEEPSEEK_API_KEY` | 你的 DeepSeek API Key（和小红书版可同 key） |

> 只需这**一个** Secret，没有抖音相关的密钥——因为本项目根本不碰抖音接口。

### 3. 绑定独立域名
在 Cloudflare Pages → Custom domains 绑定一个域名（如 `douyin.luosibainian.com`），与小红书域名平级即可。

### 4. 配置「图片全局防重复」用的 KV（关键）
为了让「一张图被任何人用过，其他人就选不到」，**必须**绑定一个 KV 命名空间：
1. Cloudflare 后台 → **Storage & Databases → KV** → Create a namespace，命名如 `douyin-media-used`，记下它的 **ID**。
2. 项目根目录 `wrangler.toml` 里把 `id = "REPLACE_WITH_YOUR_KV_NAMESPACE_ID"` 换成上面那个 ID。
3. 在 Cloudflare Pages 项目 → **Settings → Functions → KV namespace bindings**，确认出现绑定名 `DOUYIN_MEDIA_KV`（指向刚才的 namespace）；或用 `wrangler pages deploy public` 时自动读取 `wrangler.toml`。
4. 重新部署一次让绑定生效。

> ⚠️ 不绑 KV 也能跑，但「防重复」会退化为「仅本机」（每台设备各自不重复，不同人之间不共享）。要真正的全站不重复，KV 必绑。

### 5. 配置素材（两家店分开，多图池）
编辑 `public/media.config.js`，在 `stores` 里分别为 `honghutan`（红谷滩旗舰店）和 `gelanyuntian`（格兰云天店）填好图片**数组**与话题标签；把多张素材文件放进 `public/media/`（建议 `a-cover1.jpg / a-cover2.jpg / a-cover3.jpg`、`b-cover1.jpg / b-cover2.jpg / b-cover3.jpg`）。
（文件名用英文、需公网 https，规则见 `public/media/README.txt`）

---

## 使用流程（最终用户视角）

1. 打开 `https://你的域名/douyin.html`（可带 `?k=关键词` 预填，如 `?k=南昌洛斯百年婚宴`）。
2. **先点门店按钮选「红谷滩旗舰店」或「格兰云天店」**——两家店完全分开，会各自展示关键词快捷标签、用各自素材与话题标签、按各自卖点生成文案。
3. 选好门店后，点关键词快捷标签一键填入（也可自己打字，可多选组合），点「① 生成抖音图文」。
4. 文案生成后可视情况修改；页面下方自动展示该门店「当前未用过」的一张图片（全局防重复）。
5. 点「② 复制文案」，再点「③ 去抖音发布」——会自动复制文案、提前下载图片并唤起抖音 App；打开抖音后从相册勾选图片、粘贴文案、加话题即可发布。

---

## 常见问题

| 现象 | 处理 |
|---|---|
| 生成文案报错「未配置 DEEPSEEK_API_KEY」 | Cloudflare 后台补 Secret 并重部署 |
| 素材预览空白 | 检查 `media.config.js` 里的 url 是否正确、文件是否在 `public/media/` 下 |
| 手机端图片长按无法保存 | 用「下载素材」链接保存；或确认文件名为英文 |
| 想自动发、不用手动 | 抖音要自动发到用户自己账号必须走官方接口（H5 分享 / OAuth），均需企业认证（600元/年+备案域名）。本版为免认证手动方案，如确需自动发再另行评估 |
| 图片总被重复用 | 已做「全局防重复」：绑定 KV（步骤4）后，一张图被任何人发布过，其他人就选不到。需先确认 Cloudflare 已绑定 `DOUYIN_MEDIA_KV` 且重新部署。未绑 KV 时仅本机不重复 |
| 想从头轮用图片 | 页面点「重置已用图片」（会清空该店全局记录，对所有访问者生效，操作前会二次确认） |

---

## 后续可扩展（不影响当前版本）

- 接 `jianying-auto-edit` 自动产出短视频，把成片地址填进 `media.config.js` 的 `video.url`，做到「生成文案 + 自动取视频 + 手动发」。
- 若日后取得抖音企业资质，可单独加一个 H5 分享模块（不影响现有手动流程）。
