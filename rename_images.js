// ============================================================
//  宴会厅图片批量重命名脚本（小白友好，可先预览再执行）
//
//  作用：把 public/media/<店>/<厅>/ 里的图片统一重命名为 1.jpg、2.jpg … N.jpg
//  规则：
//    1. 已经按数字命名的（1.jpg、2.jpg…）排前面，按数字大小排序；
//    2. 其他文件（微信图片_xxx、DSC_xxx 等）排在后面，按文件名排序；
//    3. 整体连续编号 1 ~ N；已在正确位置的文件不动，其余改名；
//    4. .jpeg 一律改成 .jpg；无扩展名的文件先检测真实格式（JPEG/PNG 等才处理）；
//    5. 非图片文件（Thumbs.db 等）自动跳过；
//    6. 生成对照记录 media/重命名记录.csv（Excel 可直接打开），用于回退。
//
//  用法：
//    预览（不改任何文件）：  node rename_images.js --dry
//    真正执行：              node rename_images.js
// ============================================================
const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry');
const MEDIA = path.join(__dirname, 'public', 'media');
const STORES = ['honghutan', 'gelanyuntian'];
const LOG_CSV = path.join(MEDIA, '重命名记录.csv');

const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']);
const JUNK = new Set(['thumbs.db', 'desktop.ini', '.ds_store']);

// 读文件头判断真实图片格式
function sniffImage(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf.slice(0, 3).toString('ascii') === 'BM ') return 'bmp';
  return null;
}

// 排序规则：数字开头的排前（按数值大小），其余按文件名排序
function sortKey(name) {
  const m = name.match(/^(\d+)/);
  if (m) return [0, Number(m[1]), name];
  return [1, 0, name];
}

const logRows = [['门店/厅', '原文件名', '新文件名']];
let totalRenamed = 0;
let totalKept = 0;
const warnings = [];

for (const store of STORES) {
  const storeDir = path.join(MEDIA, store);
  if (!fs.existsSync(storeDir)) continue;
  for (const hall of fs.readdirSync(storeDir, { withFileTypes: true })) {
    if (!hall.isDirectory()) continue;
    const hallDir = path.join(storeDir, hall.name);

    // 1) 收集本厅所有图片文件
    const items = [];
    for (const f of fs.readdirSync(hallDir, { withFileTypes: true })) {
      if (!f.isFile()) continue;
      const lower = f.name.toLowerCase();
      if (JUNK.has(lower)) continue;
      const ext = path.extname(f.name).toLowerCase();

      if (ext === '') {
        // 无扩展名：检测真实格式
        const kind = sniffImage(fs.readFileSync(path.join(hallDir, f.name)));
        if (!kind) { warnings.push(`[跳过-非图片] ${store}/${hall.name}/${f.name}`); continue; }
        items.push({ old: f.name, ext: '.' + kind });
      } else if (IMG_EXT.has(ext)) {
        items.push({ old: f.name, ext: ext === '.jpeg' ? '.jpg' : ext });
      } else {
        warnings.push(`[跳过-非图片] ${store}/${hall.name}/${f.name}`);
      }
    }

    if (items.length === 0) { console.log(`${store}/${hall.name}: 0 张图，跳过`); continue; }

    // 2) 排序并确定目标名
    items.sort((a, b) => {
      const ka = sortKey(a.old), kb = sortKey(b.old);
      return ka[0] - kb[0] || ka[1] - kb[1] || (ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0);
    });
    const plan = items.map((it, i) => ({ ...it, next: `${i + 1}${it.ext}` }));

    // 3) 两段式改名（先改临时名避免互相覆盖）
    let renamed = 0, kept = 0;
    const todos = plan.filter(p => p.old !== p.next);
    if (!DRY) {
      for (const p of todos) {
        fs.renameSync(path.join(hallDir, p.old), path.join(hallDir, `__tmp__${p.next}`));
      }
      for (const p of todos) {
        fs.renameSync(path.join(hallDir, `__tmp__${p.next}`), path.join(hallDir, p.next));
      }
    }
    renamed = todos.length; kept = plan.length - todos.length;
    totalRenamed += renamed; totalKept += kept;

    for (const p of plan) logRows.push([`${store}/${hall.name}`, p.old, p.next]);
    console.log(`${store}/${hall.name}: 共 ${plan.length} 张，改名 ${renamed}，已正确无需改 ${kept}`);
    for (const p of todos.slice(0, 5)) console.log(`    ${p.old}  ->  ${p.next}`);
    if (todos.length > 5) console.log(`    ...（共 ${todos.length} 条，详见 CSV）`);
  }
}

console.log('------------------------------------------');
console.log(`合计：需改名 ${totalRenamed} 张，已正确 ${totalKept} 张 ${DRY ? '（预览模式，未实际改动）' : '（已完成）'}`);
if (warnings.length) { console.log('⚠ 跳过的文件：'); warnings.forEach(w => console.log('  ' + w)); }

if (!DRY) {
  // 加 BOM，Excel 打开不乱码
  fs.writeFileSync(LOG_CSV, '\ufeff' + logRows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n'), 'utf8');
  console.log(`对照记录已保存：${LOG_CSV}`);
}
