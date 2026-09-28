// ============================================================
//  按 public/media 实际图片数量，重新生成 media.config.js 里的 halls[].images
//  - 保留原有：话题标签、关键词、门店触发词、宴会厅 id/name/顺序/备注前缀
//  - images 按「门店+厅」文件夹里实际的 1.jpg ~ N.jpg 自动生成
//  - 生成前先备份 media.config.js -> media.config.backup.js
//  用法：node gen_config.js
// ============================================================
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CFG = path.join(ROOT, 'public', 'media.config.js');
const MEDIA = path.join(ROOT, 'public', 'media');

// 1) 读取现有配置（拿关键词、标签、厅名、备注前缀等）
const src = fs.readFileSync(CFG, 'utf8');
const cfg = eval(src.replace('window.MEDIA_CONFIG', 'module.exports'));

// 2) 从旧 note 提取前缀（去掉结尾的「场景图N」）
function noteBase(oldNote, hallName) {
  if (oldNote) {
    const m = String(oldNote).match(/^(.*?)\s*场景图\d+$/);
    if (m && m[1]) return m[1];
  }
  return hallName + '厅';
}

// 3) 收集每个厅在磁盘上的实际图片（按数字顺序）
const stats = [];
for (const [storeId, store] of Object.entries(cfg.stores)) {
  const storeDir = path.join(MEDIA, storeId);
  for (const hall of store.halls) {
    const hallDir = path.join(storeDir, hall.id);
    let files = [];
    if (fs.existsSync(hallDir)) {
      files = fs.readdirSync(hallDir)
        .filter(f => f.toLowerCase().endsWith('.jpg'))
        .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    }
    hall._files = files;
    hall._base = noteBase(hall.images && hall.images[0] && hall.images[0].note, hall.name);
    stats.push({ label: storeId + '/' + hall.id, name: hall.name, count: files.length });
  }
}

// 4) 备份旧配置
fs.copyFileSync(CFG, path.join(ROOT, 'public', 'media.config.backup.js'));

// 5) 逐行重写：跟踪当前门店，把每个 hall 行替换为多行 images 块
const storeHeadRe = /^\s{4}(honghutan|gelanyuntian):\s*\{/; // 门店段开头（4空格缩进）
const hallLineRe = /^\s*\{\s*id:\s*'(\w+)'\s*,\s*name:\s*'([^']+)'\s*,\s*images:/;
const lines = src.split(/\r?\n/);
const out = [];
let curStore = null;
let replaced = 0;
for (const line of lines) {
  const sm = line.match(storeHeadRe);
  if (sm) { curStore = sm[1]; out.push(line); continue; }

  const m = line.match(hallLineRe);
  if (!m || !curStore) { out.push(line); continue; }

  const store = cfg.stores[curStore];
  const hall = store.halls.find(h => h.id === m[1] && h.name === m[2]);
  if (!hall) { out.push(line); continue; }

  const indent = line.match(/^\s*/)[0];
  if (hall._files.length === 0) {
    out.push(`${indent}{ id: '${hall.id}', name: '${hall.name}', images: [] },  // ⚠ 该厅文件夹还没放图，放好图后重跑 node gen_config.js`);
  } else {
    out.push(`${indent}{ id: '${hall.id}', name: '${hall.name}', images: [`);
    hall._files.forEach((f, i) => {
      const comma = i === hall._files.length - 1 ? '' : ',';
      out.push(`${indent}  { url: '/media/${curStore}/${hall.id}/${f}', note: '${hall._base} 场景图${i + 1}' }${comma}`);
    });
    out.push(`${indent}] },`);
  }
  replaced++;
}

// 6) 写回 + 语法自检
const newSrc = out.join('\n');
fs.writeFileSync(CFG, newSrc, 'utf8');

// 自检：新配置能被解析，且 images 数量与磁盘一致
const check = eval(newSrc.replace('window.MEDIA_CONFIG', 'module.exports'));
let mismatch = 0;
for (const [storeId, store] of Object.entries(check.stores)) {
  for (const hall of store.halls) {
    const disk = fs.readdirSync(path.join(MEDIA, storeId, hall.id))
      .filter(f => f.toLowerCase().endsWith('.jpg')).length;
    if ((hall.images || []).length !== disk) {
      mismatch++;
      console.log(`✗ ${storeId}/${hall.id}: 配置 ${hall.images.length} != 磁盘 ${disk}`);
    }
  }
}
console.log('------------------------------------------');
stats.forEach(s => console.log(`${s.count === 0 ? '⚠' : '✓'} ${s.label}（${s.name}）: ${s.count} 张`));
console.log('------------------------------------------');
console.log(`共重写 ${replaced} 个厅的 images；语法自检${mismatch === 0 ? '通过，配置与磁盘完全一致 ✓' : '发现 ' + mismatch + ' 处不一致 ✗'}`);
console.log('旧配置已备份为 public/media.config.backup.js');
