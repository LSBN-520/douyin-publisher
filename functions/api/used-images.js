// ============================================================
//  全局「图片已调用记录」接口（基于 Cloudflare KV，跨所有访问者共享）
//
//  作用：记录每张图「被真正发布过」的 URL，确保任何一个人用过某张图后，
//        全网其他人都不会再选到它（防重复调用）。
//        记录精确到「门店 + 宴会厅」：每个厅独立一份已用清单，互不干扰。
//
//  路由（Cloudflare Pages Function，无需企业认证）：
//    GET  /api/used-images?store=honghutan&hall=aosika
//         -> { ok, store, hall, used:[url...], kvEnabled }
//    POST /api/used-images   body: { store, hall, url }           记录某图已用
//                         或 { store, hall, reset:true }          清空该厅记录
//         -> { ok, store, hall, used:[url...] }
//
//  依赖（Cloudflare 后台绑定）：KV 命名空间，绑定名 DOUYIN_MEDIA_KV
//  ⚠️ 若未绑定 KV，接口自动降级：返回空 used、kvEnabled=false，
//     页面退化为「仅本机不重复」，不影响部署运行。
// ============================================================

const KV_KEY = (store, hall) => 'used_imgs:' + (store || 'default') + '__' + (hall || 'default');

async function getUsed(env, store, hall) {
  if (!env || !env.DOUYIN_MEDIA_KV) return [];
  const raw = await env.DOUYIN_MEDIA_KV.get(KV_KEY(store, hall));
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

async function setUsed(env, store, hall, arr) {
  if (!env || !env.DOUYIN_MEDIA_KV) return;
  await env.DOUYIN_MEDIA_KV.put(KV_KEY(store, hall), JSON.stringify(arr));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const store = url.searchParams.get('store') || 'default';
  const hall = url.searchParams.get('hall') || 'default';
  const used = await getUsed(env, store, hall);
  return json({ ok: true, store, hall, used, kvEnabled: !!(env && env.DOUYIN_MEDIA_KV) });
}

export async function onRequestPost({ request, env }) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    /* ignore */
  }
  const store = body.store || 'default';
  const hall = body.hall || 'default';

  // 清空重置（仅清该店该厅）
  if (body.reset) {
    await setUsed(env, store, hall, []);
    return json({ ok: true, store, hall, used: [], kvEnabled: !!(env && env.DOUYIN_MEDIA_KV) });
  }

  // 记录某图已用（去重）
  const url = body.url;
  const used = await getUsed(env, store, hall);
  if (url && !used.includes(url)) used.push(url);
  await setUsed(env, store, hall, used);
  return json({ ok: true, store, hall, used });
}
