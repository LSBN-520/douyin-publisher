// ===== Cloudflare Pages Function: 抖音文案生成（独立项目） =====
// 本文件路径(独立 Cloudflare Pages 项目): functions/api/generate-douyin.js
// 触发方式: GET /api/generate-douyin?k=南昌洛斯百年婚宴&mode=image_text&store=honghutan
// 依赖(在本项目 Cloudflare 后台配置 Secrets): DEEPSEEK_API_KEY
//
// 说明: 这是抖音工具的独立 Cloudflare 项目，与小红书包平级、互不干扰。
//       直接调用 DeepSeek 生成抖音风格文案（口语化、强钩子、带话题标签、引导互动）。
//       本工具仅支持图文（image_text）模式，不生成视频文案。
//       store 参数区分门店（honghutan=红谷滩旗舰店 / gelanyuntian=格兰云天店），
//       两家店用各自卖点生成，互不串味。

// 两家店各自的品牌档案（共同卖点共用，独有卖点分开）
const STORE_PROFILES = {
  honghutan: {
    name: '洛斯百年一站式婚礼堂',
    location: '南昌红谷滩旗舰店',
    unique: [
      '东方的圣托里尼同款婚礼场景，不用去希腊',
      '直升机停机坪迎亲',
      '九龙湖地铁口（2号线九龙湖南站3号口1分钟直达）',
      '九龙湖草坪外景',
      '多处网红打卡景点',
      '独立门头+独立新娘房，私密仪式感',
      '宴会厅分流设计，不串音不拥挤',
      '紧邻融创乐园商场，吃喝玩乐一条龙',
    ],
  },
  gelanyuntian: {
    name: '洛斯百年一站式婚礼堂',
    location: '南昌格兰云天店',
    unique: [
      '半空T台天空之城，T台在半空中',
      '13.14米水晶旋转楼梯（大堂内景）',
      '象湖湿地公园旁一站式',
      '自带五星客房，外地亲友住宿方便',
      '法式户外草坪',
      '音乐喷泉环形车道，排场拉满',
      '9大无柱主题厅',
    ],
  },
};

// 两店共同的卖点（统一底稿）
const COMMON_SELLING = [
  '南昌22年婚礼老字号、婚庆行业会长单位',
  '自有厨房现炒、拒绝预制菜',
  '婚纱礼服免费送（主纱+敬酒服+秀禾服）',
  '百万级场地零元办',
  '近千免费车位，停车无忧',
  '一对一管家一站式全包，无隐形消费',
];

function buildSystemPrompt(storeId) {
  const p = STORE_PROFILES[storeId] || STORE_PROFILES.honghutan;
  const uniqueLines = p.unique.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const commonLines = COMMON_SELLING.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return `你是为「${p.name}（${p.location}）」撰写抖音图文种草文案的资深内容策划。

品牌信息：
- 名称：${p.name}
- 门店：${p.location}

本店独有卖点：
${uniqueLines}

两店共同卖点：
${commonLines}

文案风格（重点）：抖音图文「自然种草」风
1. 像朋友/闺蜜真实体验后的随手分享，第一人称或安利口吻，口语、有细节、有情绪，不堆砌卖点、不喊口号。
2. 软植入：把卖点藏在真实感受里（"那天看到直升机接亲真的被惊艳到"），而不是罗列广告词。
3. 标题像刷到的分享，≤ 30 字最佳，带一点悬念或共鸣；正文 ≤ 180 字，分段、多用短句，适合配 3–9 张图。
4. 结尾自然收束即可，可做轻量引导（如"关注我，看更多南昌婚礼真实记录"）；严禁使用"评论区扣1发资料""私信我发图"这类诱导式话术。

⚠️ 抖音合规红线（必须严格遵守，否则会被限流/判违规）：
- 严禁在文案中出现任何联系方式：手机号、微信号、二维码、外链、私信导流话术（如"加微信""电话联系"）。
- 结尾可轻量引导关注，严禁"评论区扣1发资料 / 私信我发图"等诱导式话术。
- 禁用绝对化/夸大词（最、第一、国家级、唯一、顶级等）；不夸大宣传、不承诺效果。
- 严禁出现暴露发布者性别的称呼词，也禁用群体称呼"家人们"：如"姐妹""姐妹们""兄弟""兄弟们""集美""女神""男神""姑娘""帅哥""美女""家人们"等一律禁用；统一改用中性称呼（如"宝子""各位""朋友""准新人""备婚的宝"）。
- 品牌名「${p.name}」可以自然提及，但不要反复硬塞。`;
}



export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const keyword = (url.searchParams.get('k') || '').trim();
  const mode = url.searchParams.get('mode') || 'image_text';
  const store = url.searchParams.get('store') || 'honghutan';
  const hall = (url.searchParams.get('hall') || '').trim();

  if (!keyword) {
    return Response.json({ ok: false, error: '缺少关键词参数 k' }, { status: 400 });
  }

  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return Response.json(
      { ok: false, error: '未配置 DEEPSEEK_API_KEY（请在 Cloudflare 后台添加 Secret）' },
      { status: 500 }
    );
  }

  const userPrompt = `请基于以下关键词组合，生成一条抖音图文「自然种草」文案：
关键词：${keyword}
要求：软植入卖点、像真实分享、严禁任何联系方式（手机号/微信/二维码/外链）、禁用绝对化词、结尾不要使用"评论区扣1发资料/私信我发图"等诱导式话术、严禁出现"姐妹""兄弟"等暴露发布者性别的称呼（统一用中性称呼如"宝子""各位""朋友""准新人"）。
仅返回 JSON（不要 Markdown 代码块），结构：
{
  "title": "抖音图文标题，≤30字，像随手分享、带共鸣或悬念",
  "content": "正文，≤180字，分段短句，适合配 3–9 张图",
  "hashtags": ["#标签1", "#标签2", "#标签3"],
  "hook": "开头钩子句，≤20字"
}`;

  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: buildSystemPrompt(store) },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.85,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return Response.json({ ok: false, error: 'DeepSeek 调用失败: ' + txt }, { status: 502 });
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { raw };
    }
    return Response.json({ ok: true, keyword, mode, store, hall: hall || undefined, data: parsed });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
