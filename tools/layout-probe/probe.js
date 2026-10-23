// 排版巡检（tools/layout-probe/run.py 注入到开发版页面里跑）
// 打开每个面板（连同里面的分页），量文字有没有出弹窗、出按钮、叠在一起。返回 { opened, issues[], sizes[] }
window.__probePanels = async () => {
  const main = window.__main;
  const sc = main;
  const mods = {
    P: window.__P, X: window.__X, F: window.__F, R: window.__R, T: window.__T, G4: window.__G4,
    L: await import('/src/ui/life.ts'), FM: await import('/src/ui/formation.ts'),
    D: await import('/src/ui/daily.ts'), CL: await import('/src/ui/changelog.ts'),
  };
  const jobs = [];
  const add = (label, fn) => jobs.push([label, fn]);
  for (const n of ['statusPanel', 'allocatePanel', 'bagPanel', 'generalsPanel', 'questPanel', 'hospitalPanel', 'skillSchoolPanel', 'messagesPanel', 'helpPanel', 'settingsPanel', 'playersPanel']) add('P.' + n, () => mods.P[n](sc));
  for (const t of [0, 1, 2, 3]) add('X.arenaPanel#' + t, () => mods.X.arenaPanel(sc, t));
  for (const n of ['sectPanel', 'trainingPanel', 'rankPanel', 'achvPanel', 'teamPanel', 'stallPanel', 'replayPanel']) add('X.' + n, () => mods.X[n](sc));
  for (const t of [0, 1, 2, 3]) add('X.vaultPanel#' + t, () => mods.X.vaultPanel(sc, t));
  add('D.dailyPanel', () => mods.D.dailyPanel(sc));
  add('CL.changelogPanel', () => mods.CL.changelogPanel(sc));
  add('CL.whatsNew', () => mods.CL.changelogPanel(sc, true));
  add('X.treasurePanel', () => mods.X.treasurePanel(sc, () => {}));
  for (const n of ['welfarePanel', 'recruitPanel']) add('F.' + n, () => mods.F[n](sc));
  for (const t of [0, 1, 2, 3, 4]) add('R.rolePanel#' + t, () => mods.R.rolePanel(sc, t));
  for (const n of ['weaponShopPanel', 'smithPanel', 'innPanel', 'templePanel', 'stablePanel', 'casinoPanel', 'battlefieldPanel']) add('T.' + n, () => mods.T[n](sc));
  for (const t of [0, 1]) add('T.bankPanel#' + t, () => mods.T.bankPanel(sc, t));
  for (const t of [0, 1, 2, 3, 4]) add('G4.guozhanPanel#' + t, () => mods.G4.guozhanPanel(sc, t));
  add('L.lifePanel', () => mods.L.lifePanel(sc));
  add('FM.formationPanel', () => mods.FM.formationPanel(sc));
  const g = window.__store.save.generals[0];
  if (g) add('P.generalDetail', () => mods.P.generalDetail(sc, g.uid));
  if (g) add('F.generalSkillPanel', () => mods.F.generalSkillPanel(sc, g.uid));

  const clear = () => sc.children.list.filter((x) => x.depth >= 100).forEach((x) => x.destroy());
  const masked = (o) => { for (let p = o; p; p = p.parentContainer) if (p.mask) return p; return null; };
  const report = [];
  const sizes = [];
  const check = (label) => {
    const modal = sc.children.list.filter((o) => o.inner && o.pw).pop();
    const texts = [];
    const walk = (o) => { if (!o.visible) return; if (o.type === 'Text' && o.text && o.alpha > 0) texts.push(o); if (o.list) o.list.forEach(walk); };
    sc.children.list.filter((o) => o.depth >= 100).forEach(walk);
    const issues = new Set();
    for (const t of texts) {
      const b = t.getBounds();
      const m = masked(t);
      const btn = t.parentContainer && t.parentContainer.bw ? t.parentContainer : null;
      if (btn) {
        if (b.width > btn.bw - 2) issues.add(`按钮字太长「${t.text}」字宽${Math.round(b.width)} 按钮${btn.bw}`);
        continue;
      }
      if (modal) {
        const L = modal.px + 3, Rr = modal.px + modal.pw - 3;
        if (b.right > Rr + 0.5 || b.left < L - 0.5) issues.add(`出框（横）「${t.text.slice(0, 24)}」 ${Math.round(b.left)}~${Math.round(b.right)} 框${L}~${Rr}`);
        const top = modal.py + modal.y, vh = modal.vh ?? modal.ph; if (!m && (b.bottom > top + vh - 2 || b.top < top)) issues.add(`出框（竖）「${t.text.slice(0, 24)}」 ${Math.round(b.top)}~${Math.round(b.bottom)} 框${top}~${top + vh}`);
      }
    }
    const flat = texts.filter((t) => !masked(t) && !(t.parentContainer && t.parentContainer.bw) && t.depth < 880);
    for (let i = 0; i < flat.length; i++) for (let j = i + 1; j < flat.length; j++) {
      const a = flat[i].getBounds(), c = flat[j].getBounds();
      const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left);
      const oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
      if (ox > 3 && oy > 4) issues.add(`字叠在一起「${flat[i].text.slice(0, 14)}」×「${flat[j].text.slice(0, 14)}」`);
    }
    if (issues.size) report.push(`${label}${modal ? `（框 ${modal.px},${modal.py + modal.y} ${modal.pw}×${modal.vh}）` : ''}\n  - ${[...issues].slice(0, 12).join('\n  - ')}`);
    if (modal) sizes.push(`${label}:${modal.vh}/${modal.ph}`);
    return modal;
  };
  // 弹窗里题签下面那排按钮当作分页
  const tabsOf = (modal) => {
    // 分页：题签下面同一排、一样大、都有字、加起来差不多铺满弹窗宽度的一组按钮（别的按钮不算）
    const cand = [];
    const walk = (o) => { if (o.bw && o.bh <= 28 && o.list && o.list.some((x) => x.type === 'Text' && x.text)) { const m = o.getWorldTransformMatrix(); const y = m.ty; if (y > modal.py + modal.y + 18 && y < modal.py + modal.y + 62) cand.push(o); } if (o.list) o.list.forEach(walk); };
    walk(modal);
    const rowsY = new Map();
    for (const b of cand) { const k = Math.round(b.getWorldTransformMatrix().ty) + ':' + b.bw + ':' + b.bh; rowsY.set(k, [...(rowsY.get(k) ?? []), b]); }
    for (const list of rowsY.values()) {
      const span = list.reduce((a, b) => a + b.bw, 0);
      if (list.length >= 2 && list.length <= 6 && span >= (modal.pw - 16) * 0.8) return list.sort((a, b) => a.getWorldTransformMatrix().tx - b.getWorldTransformMatrix().tx);
    }
    return [];
  };
  const tap = (b) => { const m = b.getWorldTransformMatrix(); const z = b.list.find((x) => x.type === 'Zone'); const ptr = { x: m.tx + b.bw / 2, y: m.ty + b.bh / 2 }; z.emit('pointerdown', ptr); z.emit('pointerup', ptr); };
  let opened = 0;
  for (const [label, fn] of jobs) {
    clear();
    try { fn(); } catch (e) { report.push(`${label} 打开出错 ${e.message}`); continue; }
    opened++;
    await new Promise((r) => setTimeout(r, 120));
    const modal = check(label);
    if (!modal) continue;
    const n = tabsOf(modal).length;
    for (let i = 1; i < n; i++) {
      clear();
      try { fn(); } catch { continue; }
      await new Promise((r) => setTimeout(r, 80));
      const m2 = sc.children.list.filter((o) => o.inner && o.pw).pop();
      const tb = m2 ? tabsOf(m2) : [];
      if (!tb[i]) continue;
      try { tap(tb[i]); } catch (e) { report.push(`${label} 第${i + 1}页点不开 ${e.message}`); continue; }
      await new Promise((r) => setTimeout(r, 120));
      opened++;
      check(`${label} 第${i + 1}页「${tb[i].list.find((x) => x.type === 'Text')?.text}」`);
    }
  }
  clear();
  return { opened, issues: report, sizes };
};

// 每个地点的主界面：字出不出屏、叠不叠。返回 { places, texts, issues[] }
window.__probeMain = async () => {
  const d = await import('/src/data/index.ts');
  const s = window.__store.save;
  const ids = Object.keys(d.locations);
  const report = [];
  let total = 0;
  const masked = (o) => { for (let p = o; p; p = p.parentContainer) if (p.mask) return true; return false; };
  for (const id of ids) {
    s.location = id;
    window.__main.scene.restart();
    await new Promise((r) => setTimeout(r, 350));
    const sc = window.__game.scene.getScene('Main');
    sc.children.list.filter((x) => x.depth >= 800).forEach((x) => x.destroy());
    const texts = [];
    const walk = (o) => { if (!o.visible) return; if (o.type === 'Text' && o.text && o.alpha > 0.05) texts.push(o); if (o.list) o.list.forEach(walk); };
    sc.children.list.filter((o) => o.depth < 800).forEach(walk);
    total += texts.length;
    const issues = new Set();
    for (const t of texts) {
      const b = t.getBounds();
      const btn = t.parentContainer && t.parentContainer.bw ? t.parentContainer : null;
      if (btn && b.width > btn.bw - 2) issues.add(`按钮字太长「${t.text}」`);
      if (!masked(t) && (b.right > __game.scale.width + 0.5 || b.left < -0.5)) issues.add(`出屏「${t.text.slice(0, 16)}」${Math.round(b.left)}~${Math.round(b.right)}`);
    }
    const flat = texts.filter((t) => !masked(t) && !(t.parentContainer && t.parentContainer.bw));
    for (let i = 0; i < flat.length; i++) for (let j = i + 1; j < flat.length; j++) {
      const a = flat[i].getBounds(), c = flat[j].getBounds();
      const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left);
      const oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
      if (ox > 3 && oy > 4) issues.add(`叠字「${flat[i].text.slice(0, 12)}」×「${flat[j].text.slice(0, 12)}」`);
    }
    if (issues.size) report.push(`${d.locations[id].name}：${[...issues].join('；')}`);
  }
  return { places: ids.length, texts: total, issues: report };
};

