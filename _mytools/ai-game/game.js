(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const canvas = $("#scene");
  const ctx = canvas.getContext("2d");
  const gameRoot = $("#game");

  const ui = {
    intro: $("#intro"), result: $("#result"), start: $("#startButton"), restart: $("#restartButton"),
    skillPanel: $("#skillPanel"), skillCards: $$(".skill-card"), rhythmPanel: $("#rhythmPanel"),
    notes: $("#notesLayer"), sequenceLabel: $("#sequenceLabel"), timingArc: $("#timingArc"),
    timingKey: $("#timingKey"), timingCaption: $("#timingCaption"),
    judgement: $("#judgementText"), combo: $("#comboText"), legend: $("#rhythmLegend"),
    qte: $("#qtePanel"), messageKicker: $("#messageKicker"), message: $("#messageText"),
    playerHp: $("#playerHpBar"), enemyHp: $("#enemyHpBar"), playerHpText: $("#playerHpText"),
    enemyHpText: $("#enemyHpText"), energy: $("#energyPips"), stagger: $("#staggerPips"),
    turn: $("#turnLabel"), round: $("#roundLabel"), flash: $("#flash"), mute: $("#muteButton"),
    resultEyebrow: $("#resultEyebrow"), resultTitle: $("#resultTitle"), statRounds: $("#statRounds"),
    statPerfect: $("#statPerfect"), statCombo: $("#statCombo")
  };

  const skills = [
    { name: "月蚀连斩", code: "LUNAR SEVER", keys: ["left", "right", "left", "right"], gaps: [650, 620, 720], lead: 1050, base: 26, energy: 1, color: "#76fff0" },
    { name: "贯星重刃", code: "STAR PIERCER", keys: ["right", "right", "left", "right"], gaps: [820, 780, 900], lead: 1150, base: 38, energy: 1, color: "#ffbd5c" },
    { name: "苍穹处决", code: "SKY EXECUTION", keys: ["left", "right", "right", "left", "right"], gaps: [600, 620, 760, 620], lead: 1050, base: 55, energy: -2, color: "#c7a5ff" }
  ];

  const enemyPatterns = [
    { name: "撕裂三连", beats: [800, 640, 640], damage: 10 },
    { name: "暴虐突袭", beats: [630, 430, 800, 440], damage: 9 },
    { name: "终焉乱舞", beats: [530, 530, 410, 720, 410], damage: 8 }
  ];

  const state = {
    phase: "intro", round: 1, playerHp: 100, enemyHp: 160, energy: 0, stagger: 5,
    vulnerability: false, perfectTotal: 0, bestCombo: 0, combo: 0, selectedSkill: 0,
    notes: [], sequenceStart: 0, sequenceEnd: 0, qteUntil: 0, qteResolved: false,
    lastTime: 0, shake: 0, flash: 0, playerAction: 0, playerMotion: null, enemyAction: 0, enemyOffset: 0,
    particles: [], slashes: [], damageTexts: [], sparks: [], running: false, muted: false
  };

  let audio = null;
  function initAudio() {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  }

  function tone(freq, duration = .08, type = "sine", volume = .04, delay = 0) {
    if (!audio || state.muted) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, audio.currentTime + delay);
    gain.gain.setValueAtTime(volume, audio.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + delay + duration);
    osc.connect(gain); gain.connect(audio.destination);
    osc.start(audio.currentTime + delay); osc.stop(audio.currentTime + delay + duration);
  }

  function impactSound(perfect = false) {
    tone(perfect ? 170 : 110, .12, "sawtooth", perfect ? .08 : .045);
    tone(perfect ? 920 : 560, .05, "square", .025, .015);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makePips(element, count) {
    element.innerHTML = Array.from({ length: count }, () => "<i></i>").join("");
  }

  function updateHud() {
    ui.playerHp.style.width = `${Math.max(0, state.playerHp)}%`;
    ui.enemyHp.style.width = `${Math.max(0, state.enemyHp / 1.6)}%`;
    ui.playerHpText.textContent = `${Math.max(0, Math.ceil(state.playerHp))} / 100`;
    ui.enemyHpText.textContent = `${Math.max(0, Math.ceil(state.enemyHp))} / 160`;
    [...ui.energy.children].forEach((pip, i) => pip.classList.toggle("on", i < state.energy));
    [...ui.stagger.children].forEach((pip, i) => pip.classList.toggle("on", i < state.stagger));
    ui.round.textContent = `ROUND ${String(state.round).padStart(2, "0")}`;
    ui.skillCards[2].disabled = state.energy < 2 || state.phase !== "choose";
  }

  function setMessage(kicker, text) {
    ui.messageKicker.textContent = kicker;
    ui.message.textContent = text;
  }

  function startGame() {
    initAudio();
    Object.assign(state, {
      phase: "choose", round: 1, playerHp: 100, enemyHp: 160, energy: 0, stagger: 5,
      vulnerability: false, perfectTotal: 0, bestCombo: 0, combo: 0, notes: [],
      enemyOffset: 0, playerMotion: null, running: true, qteResolved: false
    });
    state.particles.length = state.slashes.length = state.damageTexts.length = state.sparks.length = 0;
    ui.intro.classList.add("is-hidden");
    ui.result.classList.add("is-hidden");
    ui.skillPanel.classList.remove("is-hidden");
    ui.rhythmPanel.classList.add("is-hidden");
    ui.qte.classList.add("is-hidden");
    gameRoot.dataset.input = "";
    ui.turn.textContent = "玩家回合";
    setMessage("YOUR TURN", "选择作战指令");
    updateHud();
    tone(220, .08, "sine", .04); tone(330, .12, "sine", .035, .08); tone(494, .2, "sine", .03, .17);
  }

  function chooseSkill(index) {
    if (state.phase !== "choose") return;
    const skill = skills[index];
    if (index === 2 && state.energy < 2) {
      setMessage("ENERGY LOW", "脉冲能量不足");
      tone(90, .16, "square", .025);
      return;
    }
    state.selectedSkill = index;
    state.energy = Math.max(0, Math.min(3, state.energy + skill.energy));
    state.phase = "player-sequence";
    state.combo = 0;
    ui.skillPanel.classList.add("is-hidden");
    ui.rhythmPanel.classList.remove("is-hidden");
    gameRoot.dataset.input = "attack";
    ui.sequenceLabel.textContent = `${skill.code} // COMBO INPUT`;
    ui.legend.textContent = "圆环蓄满并高亮时输入";
    setMessage("ATTACK SEQUENCE", skill.name);
    state.playerAction = 1;
    scheduleNotes(skill);
    updateHud();
    tone(260, .08, "triangle", .03); tone(390, .09, "triangle", .025, .08);
  }

  function scheduleNotes(skill) {
    const now = performance.now();
    let target = now + skill.lead;
    state.sequenceStart = now;
    state.notes = skill.keys.map((key, i) => {
      if (i > 0) target += skill.gaps[i - 1];
      return { key, target, status: "pending", defense: false, element: null, judgedAt: 0, inputLocked: false, queuedRank: null, impactDone: false, motionStarted: false };
    });
    state.sequenceEnd = state.notes.at(-1).target + 520;
    renderNotes();
  }

  function renderNotes() {
    ui.notes.innerHTML = "";
    state.notes.forEach((note) => {
      const el = document.createElement("div");
      el.className = `note${note.defense ? " defense" : ""}`;
      const label = note.defense ? "防" : note.key === "left" ? "轻" : "重";
      el.innerHTML = `<b>${label}</b>`;
      ui.notes.append(el);
      note.element = el;
    });
    ui.rhythmPanel.classList.toggle("is-defense", state.notes[0]?.defense === true);
  }

  function judgeInput(key, now = performance.now()) {
    if (state.phase === "qte") {
      if (key === "left" && !state.qteResolved) resolveQte(true);
      return;
    }
    const normalized = key;
    if (!["player-sequence", "enemy-sequence"].includes(state.phase)) return;
    const pending = state.notes.filter((note) => note.status === "pending" && !note.inputLocked);
    if (!pending.length) return;
    const closest = pending.reduce((best, note) => Math.abs(note.target - now) < Math.abs(best.target - now) ? note : best);
    const delta = Math.abs(closest.target - now);
    if (delta > 330) {
      showJudgement("TOO EARLY", "miss");
      tone(80, .05, "square", .015);
      return;
    }
    if (normalized !== closest.key) {
      showJudgement("WRONG", "miss");
      state.combo = 0;
      return;
    }
    const rank = delta <= 110 ? "perfect" : delta <= 230 ? "good" : "miss";
    if (now < closest.target) {
      closest.inputLocked = true;
      closest.queuedRank = rank;
      closest.judgedAt = now;
    } else {
      resolveNote(closest, rank, now);
    }
  }

  function resolveNote(note, rank, now) {
    if (note.status !== "pending") return;
    note.status = rank;
    note.judgedAt = now;
    note.element?.classList.add(rank);
    if (rank === "perfect") {
      state.perfectTotal += 1;
      state.combo += 1;
      showJudgement("PERFECT", "perfect");
      impactSound(true);
      if (note.defense) parryEffect(true);
      else attackImpact(1.25, note, true);
    } else if (rank === "good") {
      state.combo += 1;
      showJudgement("GOOD", "good");
      impactSound(false);
      if (note.defense) parryEffect(false);
      else attackImpact(1, note, true);
    } else {
      state.combo = 0;
      showJudgement("MISS", "miss");
      if (note.defense) enemyHitEffect();
    }
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    ui.combo.textContent = `${state.combo} CHAIN`;
  }

  function showJudgement(text, rank) {
    ui.judgement.textContent = text;
    ui.judgement.style.color = rank === "perfect" ? "#8ffff3" : rank === "good" ? "#ffca71" : "#ff5b63";
    ui.judgement.animate([
      { transform: "scale(1.65)", opacity: .2 }, { transform: "scale(1)", opacity: 1 }
    ], { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" });
  }

  function updateTimedNotes(now) {
    for (const note of state.notes) {
      if (note.status !== "pending") continue;
      if (note.inputLocked && now >= note.target) {
        resolveNote(note, note.queuedRank, note.target);
        continue;
      }
      if (!note.defense && !note.impactDone && now >= note.target) attackImpact(.3, note, true, true);
      if (now > note.target + 240) resolveNote(note, "miss", now);
    }
  }

  function updateTimingVisual(now) {
    const current = state.notes.find((note) => note.status === "pending");
    state.notes.forEach((note) => note.element?.classList.toggle("current", note === current));
    if (!current) {
      ui.timingArc.style.strokeDashoffset = "0";
      ui.timingKey.textContent = "✓";
      ui.timingCaption.textContent = "序列完成";
      ui.rhythmPanel.classList.remove("is-hot");
      return;
    }
    const index = state.notes.indexOf(current);
    const start = index === 0 ? state.sequenceStart : state.notes[index - 1].target;
    const progress = Math.max(0, Math.min(1, (now - start) / (current.target - start)));
    ui.timingArc.style.strokeDashoffset = String(339.3 * (1 - progress));
    ui.timingKey.textContent = current.defense ? "防" : current.key === "left" ? "轻" : "重";
    ui.timingCaption.textContent = current.defense ? "右键防御" : current.key === "left" ? "左键轻击" : "右键重击";
    ui.rhythmPanel.classList.toggle("is-hot", Math.abs(current.target - now) <= 110);
    if (!current.defense && !current.motionStarted) {
      const anticipation = current.key === "right" ? 460 : 280;
      if (now >= current.target - anticipation) startAttackMotion(current, anticipation);
    }
  }

  function finishPlayerSequence() {
    const skill = skills[state.selectedSkill];
    const perfects = state.notes.filter((n) => n.status === "perfect").length;
    const goods = state.notes.filter((n) => n.status === "good").length;
    const accuracy = (perfects * 1.3 + goods * .8) / state.notes.length;
    let damage = Math.max(5, Math.round(skill.base * (.42 + accuracy * .58)));
    if (state.vulnerability) {
      damage = Math.round(damage * 1.35);
      state.vulnerability = false;
      setMessage("BREAK BONUS", "架势崩解 · 伤害提升");
    }
    state.enemyHp -= damage;
    addDamageText(innerWidth * .72, innerHeight * .45, damage, skill.color);
    state.shake = 12;
    ui.rhythmPanel.classList.add("is-hidden");
    gameRoot.dataset.input = "";
    updateHud();
    if (state.enemyHp <= 0) {
      state.phase = "ending";
      setTimeout(() => endBattle(true), 1000);
      return;
    }
    if (perfects === state.notes.length) {
      startQte();
    } else {
      state.phase = "transition";
      setMessage("DAMAGE", `造成 ${damage} 点伤害`);
      setTimeout(startEnemyTurn, 1050);
    }
  }

  function startQte() {
    state.phase = "qte";
    state.qteResolved = false;
    state.qteUntil = performance.now() + 1250;
    ui.qte.classList.remove("is-hidden");
    gameRoot.dataset.input = "qte";
    setMessage("LINK WINDOW", "完美连段 · 追击机会");
    tone(660, .08, "sine", .045); tone(880, .1, "sine", .04, .09);
  }

  function resolveQte(success) {
    if (state.qteResolved) return;
    state.qteResolved = true;
    ui.qte.classList.add("is-hidden");
    gameRoot.dataset.input = "";
    if (success) {
      const bonus = state.selectedSkill === 2 ? 24 : 16;
      state.enemyHp -= bonus;
      state.playerAction = 2;
      state.shake = 22;
      burst(innerWidth * .70, innerHeight * .47, "#fff0ae", 28);
      slash(innerWidth * .45, innerHeight * .35, innerWidth * .80, innerHeight * .58, "#fff3b0", 10);
      addDamageText(innerWidth * .72, innerHeight * .4, bonus, "#fff3b0", "追击");
      setMessage("FOLLOW-UP", `追击成功 · +${bonus}`);
      flash(); impactSound(true); tone(75, .28, "sawtooth", .09);
      updateHud();
      if (state.enemyHp <= 0) {
        state.phase = "ending";
        setTimeout(() => endBattle(true), 1050);
        return;
      }
    } else {
      setMessage("LINK LOST", "追击窗口关闭");
    }
    state.phase = "transition";
    setTimeout(startEnemyTurn, 950);
  }

  function startEnemyTurn() {
    if (state.enemyHp <= 0) return;
    state.phase = "enemy-telegraph";
    ui.turn.textContent = "敌方回合";
    const index = Math.min(enemyPatterns.length - 1, Math.floor((state.round - 1) / 2));
    const pattern = enemyPatterns[index];
    setMessage("ENEMY TURN", pattern.name);
    gameRoot.dataset.input = "defense";
    state.enemyAction = 1;
    tone(92, .35, "sawtooth", .045);
    setTimeout(() => {
      if (state.phase !== "enemy-telegraph") return;
      state.phase = "enemy-sequence";
      state.combo = 0;
      ui.rhythmPanel.classList.remove("is-hidden");
      ui.sequenceLabel.textContent = `${pattern.name} // PARRY SEQUENCE`;
      ui.legend.textContent = "攻击抵达光标时点击鼠标右键防御 · 连续完美可崩解架势";
      scheduleDefense(pattern);
    }, 900);
  }

  function scheduleDefense(pattern) {
    const now = performance.now();
    const lead = 1500;
    let target = now + lead;
    state.sequenceStart = now;
    state.notes = pattern.beats.map((gap) => {
      const note = { key: "right", target, status: "pending", defense: true, damage: pattern.damage, element: null, judgedAt: 0 };
      target += gap;
      return note;
    });
    state.sequenceEnd = state.notes.at(-1).target + 520;
    renderNotes();
  }

  function finishEnemySequence() {
    const perfects = state.notes.filter((n) => n.status === "perfect").length;
    const goods = state.notes.filter((n) => n.status === "good").length;
    const misses = state.notes.length - perfects - goods;
    const damage = state.notes.reduce((sum, note) => sum + (note.status === "miss" ? note.damage : note.status === "good" ? 2 : 0), 0);
    state.playerHp -= damage;
    state.stagger = Math.max(0, state.stagger - perfects);
    ui.rhythmPanel.classList.add("is-hidden");
    gameRoot.dataset.input = "";
    updateHud();
    if (state.playerHp <= 0) {
      state.phase = "ending";
      setTimeout(() => endBattle(false), 850);
      return;
    }
    if (perfects === state.notes.length) {
      state.stagger = 5;
      state.vulnerability = true;
      state.enemyOffset = 1;
      state.enemyAction = 3;
      state.shake = 16;
      setMessage("FULL PARRY", "全弹反 · 敌人架势崩解");
      burst(innerWidth * .69, innerHeight * .45, "#84fff3", 34);
      flash(); tone(1240, .18, "square", .045); tone(120, .3, "sawtooth", .055);
    } else if (state.stagger === 0) {
      state.stagger = 5;
      state.vulnerability = true;
      state.enemyOffset = .65;
      setMessage("STAGGER BREAK", "架势归零 · 敌人进入易伤");
    } else if (damage === 0) {
      setMessage("DEFENDED", "攻势完全化解");
    } else {
      setMessage("DAMAGE TAKEN", `承受 ${damage} 点伤害 · ${misses} 次失误`);
    }
    state.phase = "transition";
    state.round += 1;
    updateHud();
    setTimeout(startPlayerTurn, 1250);
  }

  function startPlayerTurn() {
    if (state.playerHp <= 0 || state.enemyHp <= 0) return;
    state.phase = "choose";
    state.playerAction = 0;
    state.enemyAction = state.vulnerability ? 3 : 0;
    ui.turn.textContent = "玩家回合";
    ui.skillPanel.classList.remove("is-hidden");
    gameRoot.dataset.input = "";
    setMessage(state.vulnerability ? "BREAK WINDOW" : "YOUR TURN", state.vulnerability ? "敌人失衡 · 把握进攻机会" : "选择作战指令");
    updateHud();
  }

  function parryEffect(perfect) {
    const x = innerWidth * .44, y = innerHeight * .48;
    burst(x, y, perfect ? "#b9fff8" : "#ffc86d", perfect ? 18 : 10);
    slash(x - 45, y + 55, x + 55, y - 55, perfect ? "#e6fffc" : "#ffd99b", perfect ? 7 : 4);
    state.shake = perfect ? 8 : 4;
    state.enemyAction = 2;
    state.playerAction = 3;
    setTimeout(() => { if (state.phase === "enemy-sequence") { state.enemyAction = 1; state.playerAction = 0; } }, 180);
  }

  function startAttackMotion(note, anticipation) {
    note.motionStarted = true;
    const recovery = note.key === "right" ? 260 : 180;
    const duration = anticipation + recovery;
    const motion = { kind: note.key, index: state.notes.indexOf(note), start: note.target - anticipation, target: note.target, duration };
    state.playerMotion = motion;
    state.playerAction = 2;
    setTimeout(() => {
      if (state.playerMotion === motion) state.playerMotion = null;
      if (state.phase === "player-sequence") state.playerAction = 1;
    }, Math.max(0, motion.start + duration - performance.now()));
  }

  function attackImpact(power, note, connects, base = false) {
    if (base && note.impactDone) return;
    note.impactDone = true;
    const heavy = note.key === "right";
    const index = state.notes.indexOf(note);
    const startX = innerWidth * .40;
    const endX = innerWidth * (connects ? .70 : .58);
    const upperCut = index % 2 === 1;
    const y1 = innerHeight * (upperCut ? .38 : .57);
    const y2 = innerHeight * (upperCut ? .57 : .38);
    const color = base ? "rgba(145,255,244,.5)" : skills[state.selectedSkill].color;
    slash(startX, y1, endX, y2, color, base ? 3 : (heavy ? 7 : 4) + power * 2);
    if (!connects) return;
    burst(endX, y2, color, base ? 4 : Math.round((heavy ? 13 : 8) * power));
    state.enemyAction = 2;
    state.shake = base ? 2 : (heavy ? 8 : 4) * power;
    setTimeout(() => { if (state.phase === "player-sequence") state.enemyAction = 0; }, base ? 80 : 140);
  }

  function enemyHitEffect() {
    state.enemyAction = 2;
    state.playerAction = 4;
    state.shake = 10;
    burst(innerWidth * .35, innerHeight * .51, "#ff645d", 15);
    slash(innerWidth * .58, innerHeight * .36, innerWidth * .34, innerHeight * .58, "#ff4f51", 8);
    tone(70, .18, "sawtooth", .065);
    setTimeout(() => { if (state.phase === "enemy-sequence") { state.enemyAction = 1; state.playerAction = 0; } }, 220);
  }

  function addDamageText(x, y, amount, color, prefix = "") {
    state.damageTexts.push({ x, y, text: `${prefix ? `${prefix} ` : ""}-${amount}`, color, life: 1 });
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 420;
      state.sparks.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .25 + Math.random() * .45, color, size: 1 + Math.random() * 3 });
    }
  }

  function slash(x1, y1, x2, y2, color, width) {
    state.slashes.push({ x1, y1, x2, y2, color, width, life: 1 });
  }

  function flash() {
    ui.flash.classList.remove("fire");
    void ui.flash.offsetWidth;
    ui.flash.classList.add("fire");
  }

  function endBattle(win) {
    state.phase = "result";
    state.running = false;
    ui.skillPanel.classList.add("is-hidden");
    ui.rhythmPanel.classList.add("is-hidden");
    ui.qte.classList.add("is-hidden");
    gameRoot.dataset.input = "";
    ui.resultEyebrow.textContent = win ? "MISSION COMPLETE" : "LINK TERMINATED";
    ui.resultTitle.textContent = win ? "目标肃清" : "作战失败";
    ui.resultTitle.style.color = win ? "#eafffb" : "#ff7479";
    ui.statRounds.textContent = String(state.round).padStart(2, "0");
    ui.statPerfect.textContent = String(state.perfectTotal).padStart(2, "0");
    ui.statCombo.textContent = String(state.bestCombo).padStart(2, "0");
    ui.result.classList.remove("is-hidden");
    if (win) { tone(330,.12,"sine",.04); tone(494,.14,"sine",.04,.13); tone(740,.5,"sine",.035,.28); }
    else { tone(140,.3,"sawtooth",.05); tone(92,.6,"sawtooth",.04,.28); }
  }

  function drawBackground(t) {
    const w = innerWidth, h = innerHeight;
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "#12191b"); gradient.addColorStop(.42, "#263031"); gradient.addColorStop(.66, "#101719"); gradient.addColorStop(1, "#05080a");
    ctx.fillStyle = gradient; ctx.fillRect(0,0,w,h);

    const glow = ctx.createRadialGradient(w*.53,h*.19,10,w*.53,h*.26,w*.55);
    glow.addColorStop(0,"rgba(246,213,158,.27)"); glow.addColorStop(.42,"rgba(125,163,151,.08)"); glow.addColorStop(1,"transparent");
    ctx.fillStyle=glow; ctx.fillRect(0,0,w,h);

    ctx.fillStyle = "#0b1113";
    ctx.fillRect(0,h*.22,w*.16,h*.45); ctx.fillRect(w*.84,h*.14,w*.16,h*.53);
    ctx.fillStyle = "#172022";
    for(let i=0;i<8;i++) {
      const x=i*w/7;
      ctx.fillRect(x-9,h*.12,18,h*.45);
      ctx.fillRect(x-28,h*.28,56,7);
    }
    ctx.fillStyle="rgba(172,189,175,.12)"; ctx.fillRect(w*.2,h*.2,w*.6,5);
    ctx.strokeStyle="rgba(115,149,145,.18)"; ctx.lineWidth=2;
    for(let i=0;i<10;i++) { ctx.beginPath(); ctx.moveTo(i*w/9, h*.59); ctx.lineTo(w*.5+(i-4.5)*w*.18,h); ctx.stroke(); }
    for(let i=0;i<8;i++) { const yy=h*.6+i*i*5.5; ctx.beginPath(); ctx.moveTo(0,yy); ctx.lineTo(w,yy); ctx.stroke(); }
    ctx.fillStyle="rgba(4,7,8,.33)"; ctx.fillRect(0,h*.59,w,h*.41);
    ctx.strokeStyle="rgba(222,190,124,.2)"; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(w*.34,h); ctx.lineTo(w*.45,h*.56); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w*.66,h); ctx.lineTo(w*.56,h*.56); ctx.stroke();

    for (let i=0;i<28;i++) {
      const x=(i*193.7+t*.012*(i%3+1))%w;
      const y=h*.15+(i*71.3)%Math.max(1,h*.52);
      ctx.fillStyle=`rgba(160,229,215,${.04+(i%4)*.02})`; ctx.fillRect(x,y,1+(i%2),1+(i%2));
    }
  }

  function drawPlayer(t) {
    const w=innerWidth,h=innerHeight;
    let x=w*.34,y=h*.64;
    const motion=state.playerMotion;
    let motionProgress=0,swordAngle=.37,bodyTilt=0;
    if(motion){
      motionProgress=Math.max(0,Math.min(1,(t-motion.start)/motion.duration));
      const strike=Math.sin(Math.PI*motionProgress);
      if(motion.kind==="left"){
        const eased=1-Math.pow(1-motionProgress,3);
        x+=strike*w*.055;
        swordAngle=-1.15+eased*1.95;
        bodyTilt=.1*strike;
      }else{
        const windup=Math.min(1,motionProgress/.34);
        const release=Math.max(0,(motionProgress-.34)/.66);
        swordAngle=release>0?-1.55+(1-Math.pow(1-release,3))*2.65:.37-windup*1.92;
        x+=Math.sin(Math.PI*release)*w*.085;
        bodyTilt=(release>0?.18:-.12)*Math.sin(Math.PI*(release>0?release:windup));
      }
    }
    if(state.playerAction===1) x += 12*Math.sin(t*.008);
    if(state.playerAction===2&&!motion) x=w*.47;
    if(state.playerAction===3) x=w*.39;
    if(state.playerAction===4) x=w*.31;
    const s=Math.min(w/1400,h/850)*1.05;
    ctx.save(); ctx.translate(x,y); ctx.scale(s,s); ctx.rotate(bodyTilt);
    ctx.fillStyle="rgba(0,0,0,.42)"; ctx.beginPath(); ctx.ellipse(0,82,80,15,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle="#0b0d0e";ctx.lineWidth=15;ctx.lineCap="round";
    ctx.beginPath();ctx.moveTo(-8,19);ctx.lineTo(-24,77);ctx.lineTo(-44,116);ctx.stroke();
    ctx.beginPath();ctx.moveTo(15,19);ctx.lineTo(35,70);ctx.lineTo(24,119);ctx.stroke();
    ctx.strokeStyle="#293234";ctx.lineWidth=9;
    ctx.beginPath();ctx.moveTo(-44,116);ctx.lineTo(-63,119);ctx.stroke();ctx.beginPath();ctx.moveTo(24,119);ctx.lineTo(48,122);ctx.stroke();
    ctx.fillStyle="#d6dde0";ctx.beginPath();ctx.moveTo(-34,-62);ctx.quadraticCurveTo(0,-81,31,-57);ctx.lineTo(20,22);ctx.quadraticCurveTo(0,45,-23,18);ctx.closePath();ctx.fill();
    ctx.fillStyle="#283135";ctx.beginPath();ctx.moveTo(-25,-48);ctx.lineTo(25,-43);ctx.lineTo(17,20);ctx.lineTo(-18,14);ctx.closePath();ctx.fill();
    ctx.fillStyle="#090b0c";ctx.beginPath();ctx.arc(-1,-88,21,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#15191a";ctx.beginPath();ctx.moveTo(-18,-93);ctx.quadraticCurveTo(-42,-70,-18,-24);ctx.lineTo(4,-64);ctx.closePath();ctx.fill();
    ctx.strokeStyle="#d8e3e4";ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(-23,-42);ctx.lineTo(-55,-3);ctx.stroke();ctx.beginPath();ctx.moveTo(24,-40);ctx.lineTo(58,-4);ctx.stroke();
    ctx.strokeStyle="#081013";ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(-55,-3);ctx.lineTo(-12,20);ctx.stroke();
    ctx.save();ctx.translate(-41,1);ctx.rotate(swordAngle);
    const swordGlow=ctx.createLinearGradient(0,0,196,0);swordGlow.addColorStop(0,"#152326");swordGlow.addColorStop(.5,"#dffefa");swordGlow.addColorStop(1,"#69fff0");
    if(motion&&motionProgress>.2&&motionProgress<.88){ctx.strokeStyle="rgba(107,255,241,.18)";ctx.lineWidth=22;ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(205,0);ctx.stroke();}
    ctx.strokeStyle=swordGlow;ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(196,0);ctx.stroke();
    ctx.strokeStyle="rgba(110,255,242,.75)";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(5,-4);ctx.lineTo(201,-4);ctx.stroke();ctx.restore();
    ctx.fillStyle="#7efff1";ctx.fillRect(-8,-43,5,36);ctx.fillStyle="rgba(126,255,241,.35)";ctx.fillRect(-13,-45,15,40);
    ctx.restore();
  }

  function drawEnemy(t) {
    const w=innerWidth,h=innerHeight;
    const retreat=state.enemyOffset*95;
    const x=w*.69+retreat,y=h*.56;
    const s=Math.min(w/1400,h/850)*1.2;
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    if(state.enemyAction===1) ctx.translate(-12+Math.sin(t*.01)*9,0);
    if(state.enemyAction===2) ctx.rotate(.07*Math.sin(t*.03));
    if(state.enemyAction===3) ctx.rotate(.18);
    ctx.fillStyle="rgba(0,0,0,.5)";ctx.beginPath();ctx.ellipse(0,115,105,22,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#171616";ctx.lineWidth=23;ctx.lineCap="round";
    ctx.beginPath();ctx.moveTo(-27,45);ctx.lineTo(-66,91);ctx.lineTo(-76,129);ctx.stroke();ctx.beginPath();ctx.moveTo(29,45);ctx.lineTo(70,89);ctx.lineTo(83,128);ctx.stroke();
    ctx.fillStyle="#202322";ctx.beginPath();ctx.moveTo(-58,-65);ctx.lineTo(-25,-112);ctx.lineTo(30,-106);ctx.lineTo(68,-55);ctx.lineTo(45,54);ctx.lineTo(-42,53);ctx.closePath();ctx.fill();
    ctx.fillStyle="#343a36";for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(-55+i*24,-57-i%2*9);ctx.lineTo(-43+i*24,-100-i%2*6);ctx.lineTo(-22+i*24,-58);ctx.closePath();ctx.fill();}
    ctx.fillStyle="#111413";ctx.beginPath();ctx.moveTo(-30,-111);ctx.lineTo(0,-145);ctx.lineTo(32,-108);ctx.lineTo(19,-77);ctx.lineTo(-19,-78);ctx.closePath();ctx.fill();
    ctx.fillStyle="#ff554e";ctx.beginPath();ctx.ellipse(0,-103,8,16,0,0,Math.PI*2);ctx.fill();ctx.shadowColor="#ff544d";ctx.shadowBlur=18;ctx.fill();ctx.shadowBlur=0;
    ctx.strokeStyle="#252826";ctx.lineWidth=19;ctx.beginPath();ctx.moveTo(-50,-49);ctx.lineTo(-100,-4);ctx.lineTo(-127,48);ctx.stroke();ctx.beginPath();ctx.moveTo(54,-47);ctx.lineTo(104,-2);ctx.lineTo(133,47);ctx.stroke();
    ctx.strokeStyle="#6f6659";ctx.lineWidth=5;for(const side of[-1,1]){for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(side*(119+i*5),35+i*4);ctx.lineTo(side*(160+i*7),53-i*8);ctx.stroke();}}
    ctx.strokeStyle="rgba(255,83,72,.65)";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-23,-72);ctx.lineTo(0,-22);ctx.lineTo(23,-72);ctx.stroke();
    ctx.restore();
  }

  function drawEffects(dt) {
    for (const s of state.slashes) {
      ctx.save();ctx.globalAlpha=Math.max(0,s.life);ctx.strokeStyle=s.color;ctx.shadowColor=s.color;ctx.shadowBlur=22;ctx.lineWidth=s.width*s.life;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);ctx.stroke();ctx.restore();s.life-=dt*4;
    }
    state.slashes=state.slashes.filter(s=>s.life>0);
    for(const p of state.sparks){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=380*dt;p.life-=dt;ctx.save();ctx.globalAlpha=Math.min(1,p.life*3);ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=8;ctx.fillRect(p.x,p.y,p.size*3,p.size);ctx.restore();}
    state.sparks=state.sparks.filter(p=>p.life>0);
    for(const d of state.damageTexts){d.y-=34*dt;d.life-=dt*.85;ctx.save();ctx.globalAlpha=Math.max(0,d.life);ctx.fillStyle=d.color;ctx.font="800 italic 30px 'Barlow Condensed'";ctx.shadowColor="#000";ctx.shadowBlur=7;ctx.fillText(d.text,d.x,d.y);ctx.restore();}
    state.damageTexts=state.damageTexts.filter(d=>d.life>0);
  }

  function frame(now) {
    const dt=Math.min(.033,(now-state.lastTime)/1000||0);state.lastTime=now;
    ctx.save();
    if(state.shake>0){ctx.translate((Math.random()-.5)*state.shake,(Math.random()-.5)*state.shake);state.shake=Math.max(0,state.shake-dt*45);}
    drawBackground(now);drawEnemy(now);drawPlayer(now);drawEffects(dt);ctx.restore();

    if(state.phase==="player-sequence"||state.phase==="enemy-sequence"){
      updateTimingVisual(now);updateTimedNotes(now);
      if(now>state.sequenceEnd){
        if(state.phase==="player-sequence")finishPlayerSequence();else finishEnemySequence();
      }
    }
    if(state.phase==="qte"&&!state.qteResolved&&now>state.qteUntil)resolveQte(false);
    if(state.enemyOffset>0&&!state.vulnerability)state.enemyOffset=Math.max(0,state.enemyOffset-dt*.9);
    requestAnimationFrame(frame);
  }

  function handleKey(event) {
    const key=event.key.toLowerCase();
    if(state.phase==="intro"&&event.key==="Enter")startGame();
    if(state.phase==="choose"&&["1","2","3"].includes(key))chooseSkill(Number(key)-1);
  }

  function handlePointer(event) {
    if (event.target.closest("#touchControls")) return;
    const key = event.button === 0 ? "left" : event.button === 2 ? "right" : null;
    if (!key || !["player-sequence", "enemy-sequence", "qte"].includes(state.phase)) return;
    event.preventDefault();
    initAudio();
    judgeInput(key);
  }

  ui.start.addEventListener("click",startGame);
  ui.restart.addEventListener("click",startGame);
  ui.skillCards.forEach((card,i)=>card.addEventListener("click",()=>chooseSkill(i)));
  ui.mute.addEventListener("click",()=>{state.muted=!state.muted;ui.mute.textContent=`声音 ${state.muted?"OFF":"ON"}`;if(!state.muted)initAudio();});
  $("#touchControls").addEventListener("pointerdown",(event)=>{const button=event.target.closest("button");if(button){event.preventDefault();event.stopPropagation();initAudio();judgeInput(button.dataset.key==="defense"?"right":button.dataset.key);}});
  gameRoot.addEventListener("pointerdown", handlePointer);
  gameRoot.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("keydown",handleKey);
  window.addEventListener("resize",resize);

  makePips(ui.energy,3);makePips(ui.stagger,5);resize();updateHud();requestAnimationFrame(frame);
})();
