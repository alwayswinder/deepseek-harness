(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const canvas = $("#scene");
  const ctx = canvas.getContext("2d");
  const gameRoot = $("#game");

  const ui = {
    intro: $("#intro"), result: $("#result"), start: $("#startButton"), restart: $("#restartButton"),
    skillPanel: $("#skillPanel"), charge: $("#chargeButton"), transform: $("#transformButton"), attack: $("#attackButton"),
    defend: $("#defendButton"), skip: $("#skipButton"), rhythmPanel: $("#rhythmPanel"),
    notes: $("#notesLayer"), sequenceLabel: $("#sequenceLabel"), timingArc: $("#timingArc"),
    timingKey: $("#timingKey"), timingCaption: $("#timingCaption"),
    judgement: $("#judgementText"), combo: $("#comboText"), legend: $("#rhythmLegend"),
    qte: $("#qtePanel"), messageKicker: $("#messageKicker"), message: $("#messageText"),
    playerHp: $("#playerHpBar"), enemyHp: $("#enemyHpBar"), playerHpText: $("#playerHpText"),
    enemyHpText: $("#enemyHpText"), playerAp: $("#playerApPips"), stagger: $("#staggerPips"),
    playerAtb: $("#playerAtbBar"), bossAtb: $("#bossAtbBar"), guardBadge: $("#guardBadge"), chargeBadge: $("#chargeBadge"),
    transformBadge: $("#transformBadge"), bossAp: $("#bossApPips"),
    playerSpeed: $("#playerSpeedText"), bossSpeed: $("#bossSpeedText"),
    turn: $("#turnLabel"), round: $("#roundLabel"), flash: $("#flash"), mute: $("#muteButton"),
    resultEyebrow: $("#resultEyebrow"), resultTitle: $("#resultTitle"), statRounds: $("#statRounds"),
    statPerfect: $("#statPerfect"), statCombo: $("#statCombo")
  };

  const PLAYER_MAX_HP = 60;
  const BOSS_MAX_HP = 320;
  const ATTACK_BASE_DAMAGE = 40;
  const ATTACK_COLOR = "#76fff0";
  const BOSS_HOLD_CHANCE = .20;

  const enemyPatterns = [
    { name: "撕裂三连", beats: [800, 640, 640], damage: 11 },
    { name: "暴虐突袭", beats: [630, 430, 800, 440], damage: 10 },
    { name: "终焉乱舞", beats: [530, 530, 410, 720, 410], damage: 9 }
  ];

  const ATB_RATE = .56;

  const state = {
    phase: "intro", actionCount: 0, bossActions: 0, playerControlId: 0, playerHp: PLAYER_MAX_HP, enemyHp: BOSS_MAX_HP, stagger: 5,
    playerSpeed: 72, bossSpeed: 36, playerAtb: 0, bossAtb: 35, playerAp: 1, bossAp: 0, bossHolding: false,
    guarding: false, guardControlId: 0, charged: false, transformUntilControl: 0, currentAttack: null, currentEnemyCombo: false,
    vulnerability: false, perfectTotal: 0, bestCombo: 0, combo: 0,
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
    ui.playerHp.style.width = `${Math.max(0, state.playerHp / PLAYER_MAX_HP * 100)}%`;
    ui.enemyHp.style.width = `${Math.max(0, state.enemyHp / BOSS_MAX_HP * 100)}%`;
    ui.playerHpText.textContent = `${Math.max(0, Math.ceil(state.playerHp))} / ${PLAYER_MAX_HP}`;
    ui.enemyHpText.textContent = `${Math.max(0, Math.ceil(state.enemyHp))} / ${BOSS_MAX_HP}`;
    [...ui.playerAp.children].forEach((pip, i) => pip.classList.toggle("on", i < state.playerAp));
    [...ui.stagger.children].forEach((pip, i) => pip.classList.toggle("on", i < state.stagger));
    ui.playerAtb.style.width = `${state.playerAtb}%`;
    ui.bossAtb.style.width = `${state.bossAtb}%`;
    ui.playerSpeed.textContent = `SPD ${state.playerSpeed}`;
    ui.bossSpeed.textContent = `SPD ${state.bossSpeed}`;
    ui.guardBadge.classList.toggle("on", state.guarding);
    ui.chargeBadge.classList.toggle("on", state.charged);
    ui.transformBadge.classList.toggle("on", isTransformed());
    ui.transformBadge.textContent = `变身 ${Math.max(0, state.transformUntilControl - state.playerControlId + 1)}`;
    ui.charge.classList.toggle("armed", state.charged);
    ui.transform.classList.toggle("armed", isTransformed());
    ui.defend.classList.toggle("armed", state.guarding);
    [...ui.bossAp.children].forEach((pip, i) => pip.classList.toggle("on", i < state.bossAp));
    ui.round.textContent = state.phase === "intro" ? "ATB // STANDBY" : `${isAtbPaused() ? "ATB PAUSED" : "ATB"} // ${state.playerAp} AP`;
    const canCommand = state.phase === "atb-wait" && state.playerAp > 0;
    ui.charge.disabled = !canCommand || state.playerAp < 1 || state.charged;
    ui.transform.disabled = !canCommand || state.playerAp < 1 || isTransformed();
    ui.attack.disabled = !canCommand || state.playerAp < 1;
    ui.defend.disabled = !canCommand || state.guarding;
    ui.skip.disabled = !canCommand;
  }

  function setMessage(kicker, text) {
    ui.messageKicker.textContent = kicker;
    ui.message.textContent = text;
  }

  function startGame() {
    initAudio();
    Object.assign(state, {
      phase: "atb-wait", actionCount: 1, bossActions: 0, playerControlId: 1,
      playerHp: PLAYER_MAX_HP, enemyHp: BOSS_MAX_HP, stagger: 5,
      playerAtb: 0, bossAtb: 35, playerAp: 1, bossAp: 0, bossHolding: false,
      guarding: false, guardControlId: 0, charged: false, transformUntilControl: 0, currentAttack: null, currentEnemyCombo: false,
      vulnerability: false, perfectTotal: 0, bestCombo: 0, combo: 0, notes: [],
      enemyOffset: 0, playerAction: 0, playerMotion: null, enemyAction: 0,
      running: true, qteResolved: false
    });
    state.particles.length = state.slashes.length = state.damageTexts.length = state.sparks.length = 0;
    ui.intro.classList.add("is-hidden");
    ui.result.classList.add("is-hidden");
    ui.skillPanel.classList.remove("is-hidden");
    ui.rhythmPanel.classList.add("is-hidden");
    ui.qte.classList.add("is-hidden");
    gameRoot.dataset.input = "";
    ui.turn.textContent = "ATB 实时战斗";
    setMessage("1 AP READY", "选择指令，双方 ATB 已暂停");
    updateHud();
    tone(220, .08, "sine", .04); tone(330, .12, "sine", .035, .08); tone(494, .2, "sine", .03, .17);
  }

  function spendPlayerAp(cost) {
    if (state.phase !== "atb-wait" || state.playerAp < cost) {
      setMessage("AP LOW", "行动力不足");
      tone(90, .16, "square", .025);
      return false;
    }
    if (state.playerAp === 3) state.playerAtb = 0;
    state.playerAp -= cost;
    return true;
  }

  function chooseCharge() {
    if (state.charged || !spendPlayerAp(1)) return;
    state.charged = true;
    setMessage("CHARGE READY", "下一次攻击：基础伤害 ×2 · PERFECT ×3");
    tone(260, .18, "sawtooth", .035); tone(520, .2, "sine", .035, .12);
    updateHud();
  }

  function chooseTransform() {
    if (isTransformed() || !spendPlayerAp(1)) return;
    state.transformUntilControl = state.playerControlId + 1;
    setMessage("SHIFT ACTIVE", "当前及下一控制窗口：攻击判定 4 → 2");
    burst(innerWidth * .35, innerHeight * .52, "#c8a4ff", 20);
    tone(420, .16, "triangle", .035); tone(840, .25, "sine", .035, .12);
    updateHud();
  }

  function chooseAttack() {
    if (!spendPlayerAp(1)) return;
    const transformed = isTransformed();
    const noteCount = transformed ? 2 : 4;
    const skill = {
      name: transformed ? "变身攻击" : "随机斩击",
      code: transformed ? "SHIFT STRIKE" : "RANDOM STRIKE",
      keys: Array.from({ length: noteCount }, () => Math.random() < .5 ? "left" : "right"),
      gaps: transformed ? [820] : [650, 620, 720],
      lead: 1050,
      color: transformed ? "#c8a4ff" : ATTACK_COLOR
    };
    state.currentAttack = { charged: state.charged, transformed, color: skill.color };
    state.charged = false;
    state.phase = "player-sequence";
    state.combo = 0;
    ui.skillPanel.classList.add("is-hidden");
    ui.rhythmPanel.classList.remove("is-hidden");
    gameRoot.dataset.input = "attack";
    ui.sequenceLabel.textContent = `${skill.code} // ${noteCount} RANDOM INPUTS`;
    ui.legend.textContent = state.currentAttack.charged ? "蓄力生效 · 基础 ×2 · PERFECT ×3" : "随机轻重按键 · 圆环高亮时输入";
    setMessage("ATTACK SEQUENCE", skill.name);
    state.playerAction = 1;
    scheduleNotes(skill);
    updateHud();
    tone(260, .08, "triangle", .03); tone(390, .09, "triangle", .025, .08);
  }

  function chooseDefense() {
    if (state.phase !== "atb-wait" || state.playerAp < 1 || state.guarding) return;
    if (!spendPlayerAp(1)) return;
    state.guarding = true;
    state.guardControlId = state.playerControlId;
    setMessage("GUARD ARMED", "防御已准备 · Boss 下次攻击可弹反");
    tone(440, .08, "triangle", .035); tone(660, .12, "sine", .025, .08);
    updateHud();
  }

  function skipAction() {
    if (state.phase !== "atb-wait" || state.playerAp < 1) return;
    if (state.playerAp === 3) state.playerAtb = 0;
    state.phase = "atb-yield";
    ui.turn.textContent = "PLAYER PASS";
    setMessage("ATB RACE", `保留 ${state.playerAp} AP · 下一条先满者行动`);
    tone(180, .08, "triangle", .02);
    updateHud();
  }

  function returnToAtb(newControl = false, kicker = null, text = null) {
    if (state.playerHp <= 0 || state.enemyHp <= 0) return;
    if (newControl && state.playerAp > 0) {
      state.playerControlId += 1;
      state.actionCount += 1;
      if (state.guarding && state.guardControlId < state.playerControlId) state.guarding = false;
      if (state.transformUntilControl < state.playerControlId) state.transformUntilControl = 0;
    }
    state.phase = "atb-wait";
    state.playerAction = 0;
    state.playerMotion = null;
    state.enemyAction = state.vulnerability ? 3 : 0;
    ui.skillPanel.classList.remove("is-hidden");
    ui.rhythmPanel.classList.add("is-hidden");
    gameRoot.dataset.input = "";
    ui.turn.textContent = "ATB 实时战斗";
    if (kicker && text) setMessage(kicker, text);
    else if (state.vulnerability) setMessage("BREAK WINDOW", "敌人失衡 · 把握进攻机会");
    else if (state.playerAp > 0) setMessage("ATB PAUSED", "选择指令 · 决策期间行动条停止");
    else setMessage("ATB CHARGING", "行动力积累中");
    updateHud();
  }

  function isPlayerActionWindow() {
    if (state.phase === "atb-wait") return state.playerAp > 0;
    return ["player-sequence", "qte", "player-transition"].includes(state.phase);
  }

  function isTransformed() {
    return state.transformUntilControl >= state.playerControlId && state.transformUntilControl > 0;
  }

  function isAtbPaused() {
    return isPlayerActionWindow() || ["enemy-telegraph", "enemy-sequence", "enemy-unguarded", "enemy-transition"].includes(state.phase);
  }

  function updateAtb(dt) {
    if (!state.running || isAtbPaused()) return;
    let changed = false;
    const playerWasWaiting = state.phase === "atb-yield" || (state.phase === "atb-wait" && state.playerAp === 0);
    if (state.playerAp < 3 || state.phase === "atb-yield") {
      state.playerAtb += state.playerSpeed * ATB_RATE * dt;
      if (state.playerAtb >= 100) {
        state.playerAtb = state.playerAp < 3 ? state.playerAtb - 100 : 100;
        if (state.playerAp < 3) state.playerAp += 1;
        changed = true;
        tone(760, .07, "sine", .025); tone(1040, .1, "sine", .02, .06);
        if (playerWasWaiting) returnToAtb(true, "PLAYER READY", `玩家 ATB 率先充满 · 当前 ${state.playerAp} AP`);
      }
    } else {
      state.playerAtb = 100;
    }
    if (state.bossAp < 2) {
      state.bossAtb += state.bossSpeed * ATB_RATE * dt;
      if (state.bossAtb >= 100) {
        state.bossAtb -= 100;
        state.bossAp += 1;
        if (state.bossAp === 1) {
          state.bossHolding = Math.random() < BOSS_HOLD_CHANCE;
          if (state.bossHolding && !isPlayerActionWindow()) setMessage("BOSS HOLDS", "Boss 跳过行动 · 积攒第二格 ATB");
        } else {
          state.bossHolding = false;
        }
        changed = true;
      }
    } else {
      state.bossAtb = 100;
    }
    if (changed) updateHud();
    else {
      ui.playerAtb.style.width = `${Math.min(100, state.playerAtb)}%`;
      ui.bossAtb.style.width = `${Math.min(100, state.bossAtb)}%`;
    }
  }

  function processAtbQueue() {
    const bossCanAct = state.phase === "atb-yield" || (state.phase === "atb-wait" && state.playerAp === 0);
    const bossWillAct = state.bossAp >= 2 || (state.bossAp === 1 && !state.bossHolding);
    if (bossCanAct && bossWillAct) startEnemyTurn();
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
    const perfects = state.notes.filter((n) => n.status === "perfect").length;
    const charged = state.currentAttack?.charged === true;
    const damagePerNote = ATTACK_BASE_DAMAGE / state.notes.length;
    let damage = Math.round(state.notes.reduce((sum, note) => {
      const multiplier = charged
        ? note.status === "perfect" ? 3 : note.status === "good" ? 2.5 : 2
        : note.status === "perfect" ? 1.8 : note.status === "good" ? 1.4 : 1;
      return sum + damagePerNote * multiplier;
    }, 0));
    if (state.vulnerability) {
      damage = Math.round(damage * 1.35);
      state.vulnerability = false;
      setMessage("BREAK BONUS", "架势崩解 · 伤害提升");
    }
    state.enemyHp -= damage;
    addDamageText(innerWidth * .72, innerHeight * .45, damage, state.currentAttack?.color || ATTACK_COLOR, charged ? "蓄力" : "");
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
      state.phase = "player-transition";
      setMessage(charged ? "CHARGED HIT" : "DAMAGE", `造成 ${damage} 点伤害`);
      setTimeout(() => returnToAtb(false), 1050);
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
      const bonus = 20;
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
    state.phase = "player-transition";
    setTimeout(() => returnToAtb(false), 950);
  }

  function startEnemyTurn() {
    if (!["atb-wait", "atb-yield"].includes(state.phase) || state.enemyHp <= 0 || state.bossAp < 1) return;
    const isCombo = state.bossAp >= 2;
    if (isCombo) state.bossAtb = 0;
    state.bossAp -= isCombo ? 2 : 1;
    state.bossHolding = false;
    state.currentEnemyCombo = isCombo;
    state.bossActions += 1;
    state.phase = "enemy-telegraph";
    ui.turn.textContent = isCombo ? "BOSS OVERDRIVE" : "BOSS ACTION";
    const index = Math.min(enemyPatterns.length - 1, Math.floor((state.bossActions - 1) / 2));
    const basePattern = enemyPatterns[index];
    const pattern = {
      name: isCombo ? `超载 · ${basePattern.name}` : basePattern.name,
      beats: isCombo ? basePattern.beats.map((gap) => Math.round(gap / 1.2)) : basePattern.beats,
      damage: basePattern.damage * (isCombo ? 2 : 1),
      combo: isCombo
    };
    const canParry = state.guarding;
    state.guarding = false;
    setMessage(isCombo ? "BOSS CHARGING" : canParry ? "GUARD RESPONSE" : "ENEMY ATTACK", isCombo ? "两格行动力 · 蓄力后发动双倍伤害连招" : canParry ? `${pattern.name} · 准备弹反` : `${pattern.name} · 未进入防御`);
    gameRoot.dataset.input = canParry ? "defense" : "";
    state.enemyAction = 1;
    updateHud();
    tone(92, .35, "sawtooth", .045);
    if (isCombo) {
      setTimeout(() => {
        if (state.phase !== "enemy-telegraph") return;
        setMessage("POWER ×2", `${pattern.name} · 节奏速度 ×1.2`);
        burst(innerWidth * .69, innerHeight * .44, "#ff655f", 28);
        tone(70, .45, "sawtooth", .07); tone(420, .22, "square", .035, .1);
      }, 700);
    }
    setTimeout(() => {
      if (state.phase !== "enemy-telegraph") return;
      if (canParry) {
        state.phase = "enemy-sequence";
        state.combo = 0;
        ui.rhythmPanel.classList.remove("is-hidden");
        ui.sequenceLabel.textContent = `${pattern.name} // ${isCombo ? "1.2× OVERDRIVE" : "PARRY SEQUENCE"}`;
        ui.legend.textContent = isCombo ? "双倍伤害连招 · 攻击节奏加快 1.2 倍" : "攻击抵达光标时点击鼠标右键防御 · 连续完美可崩解架势";
        scheduleDefense(pattern);
      } else {
        resolveUnguardedBossAttack(pattern);
      }
    }, isCombo ? 1400 : 900);
  }

  function resolveUnguardedBossAttack(pattern) {
    state.phase = "enemy-unguarded";
    const damage = Math.round(pattern.damage * pattern.beats.length * .75);
    state.playerHp -= damage;
    enemyHitEffect();
    addDamageText(innerWidth * .31, innerHeight * .43, damage, "#ff6a64", "直击");
    setMessage("DIRECT HIT", `未防御 · 承受 ${damage} 点伤害`);
    updateHud();
    if (state.playerHp <= 0) {
      state.phase = "ending";
      setTimeout(() => endBattle(false), 850);
      return;
    }
    setTimeout(() => returnToAtb(true), 900);
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
    state.phase = "enemy-transition";
    updateHud();
    setTimeout(() => returnToAtb(true), 1250);
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
    const color = base ? "rgba(145,255,244,.5)" : state.currentAttack?.color || ATTACK_COLOR;
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
    setTimeout(() => { if (["enemy-sequence", "enemy-unguarded"].includes(state.phase)) { state.enemyAction = 1; state.playerAction = 0; } }, 220);
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
    ui.statRounds.textContent = String(state.actionCount).padStart(2, "0");
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
    const transformed=isTransformed();
    const chargedEffect=state.charged||(state.currentAttack?.charged===true&&["player-sequence","qte","player-transition"].includes(state.phase));
    ctx.save(); ctx.translate(x,y); ctx.scale(s,s); ctx.rotate(bodyTilt);
    drawPlayerAura(t,transformed,chargedEffect);
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
    const bladeColor=chargedEffect?"#fff0a8":transformed?"#c9a8ff":"#69fff0";
    const swordGlow=ctx.createLinearGradient(0,0,196,0);swordGlow.addColorStop(0,"#152326");swordGlow.addColorStop(.5,"#f4fffd");swordGlow.addColorStop(1,bladeColor);
    if(motion&&motionProgress>.2&&motionProgress<.88){ctx.strokeStyle=chargedEffect?"rgba(255,226,124,.3)":transformed?"rgba(202,166,255,.28)":"rgba(107,255,241,.18)";ctx.lineWidth=chargedEffect?30:22;ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(205,0);ctx.stroke();}
    ctx.strokeStyle=swordGlow;ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(196,0);ctx.stroke();
    ctx.strokeStyle=bladeColor;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(5,-4);ctx.lineTo(201,-4);ctx.stroke();ctx.restore();
    ctx.fillStyle=bladeColor;ctx.fillRect(-8,-43,5,36);ctx.globalAlpha=.35;ctx.fillRect(-13,-45,15,40);ctx.globalAlpha=1;
    drawPlayerGuard(t);
    ctx.restore();
  }

  function drawPlayerAura(t,transformed,chargedEffect) {
    if (transformed) {
      const pulse=.72+.18*Math.sin(t*.006);
      const aura=ctx.createRadialGradient(0,-18,20,0,-18,150);
      aura.addColorStop(0,`rgba(211,180,255,${.12*pulse})`);
      aura.addColorStop(.58,`rgba(143,78,255,${.18*pulse})`);
      aura.addColorStop(1,"rgba(98,42,190,0)");
      ctx.fillStyle=aura;ctx.beginPath();ctx.ellipse(0,-18,145,190,0,0,Math.PI*2);ctx.fill();
      ctx.save();ctx.rotate(t*.0007);ctx.setLineDash([18,13]);ctx.strokeStyle=`rgba(203,164,255,${.48*pulse})`;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(0,76,104,28,0,0,Math.PI*2);ctx.stroke();ctx.restore();
      for(let i=0;i<5;i++){
        const a=t*.0016+i*Math.PI*2/5;
        const px=Math.cos(a)*82,py=-22+Math.sin(a)*112;
        ctx.fillStyle=`rgba(218,192,255,${.38+.24*Math.sin(a+t*.004)})`;ctx.shadowColor="#b47cff";ctx.shadowBlur=12;ctx.fillRect(px-2,py-10,4,20);ctx.shadowBlur=0;
      }
    }
    if (chargedEffect) {
      const pulse=.65+.35*Math.sin(t*.011);
      ctx.strokeStyle=`rgba(255,226,121,${.42+.28*pulse})`;ctx.shadowColor="#ffe277";ctx.shadowBlur=20;ctx.lineWidth=4;ctx.beginPath();ctx.arc(-4,-24,75+8*pulse,-2.4,.9);ctx.stroke();ctx.shadowBlur=0;
      for(let i=0;i<6;i++){
        const a=-t*.0022+i*Math.PI/3;
        const radius=64+(i%2)*25;
        const px=Math.cos(a)*radius,py=-24+Math.sin(a)*radius*1.35;
        ctx.fillStyle=i%2?"#fff8c8":"#78fff1";ctx.fillRect(px-2,py-2,4,4);
      }
    }
  }

  function drawPlayerGuard(t) {
    if (!state.guarding) return;
    const pulse=.68+.22*Math.sin(t*.009);
    ctx.save();ctx.translate(58,-16);ctx.scale(.72,1);
    ctx.strokeStyle=`rgba(255,202,104,${pulse})`;ctx.shadowColor="#ffc15d";ctx.shadowBlur=18;ctx.lineWidth=6;ctx.beginPath();ctx.arc(0,0,105,-1.25,1.25);ctx.stroke();
    ctx.strokeStyle=`rgba(255,238,190,${.32*pulse})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,88,-1.18,1.18);ctx.stroke();
    ctx.restore();ctx.shadowBlur=0;
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
    updateAtb(dt);
    processAtbQueue();
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
    if(state.phase==="atb-wait"&&key==="1")chooseCharge();
    if(state.phase==="atb-wait"&&key==="2")chooseTransform();
    if(state.phase==="atb-wait"&&key==="3")chooseAttack();
  }

  function handlePointer(event) {
    if (event.target.closest("#touchControls, #skillPanel")) return;
    const key = event.button === 0 ? "left" : event.button === 2 ? "right" : null;
    if (!key || !["player-sequence", "enemy-sequence", "qte"].includes(state.phase)) return;
    event.preventDefault();
    initAudio();
    judgeInput(key);
  }

  ui.start.addEventListener("click",startGame);
  ui.restart.addEventListener("click",startGame);
  ui.charge.addEventListener("click",chooseCharge);
  ui.transform.addEventListener("click",chooseTransform);
  ui.attack.addEventListener("click",chooseAttack);
  ui.defend.addEventListener("click",chooseDefense);
  ui.skip.addEventListener("click",skipAction);
  ui.mute.addEventListener("click",()=>{state.muted=!state.muted;ui.mute.textContent=`声音 ${state.muted?"OFF":"ON"}`;if(!state.muted)initAudio();});
  $("#touchControls").addEventListener("pointerdown",(event)=>{const button=event.target.closest("button");if(button){event.preventDefault();event.stopPropagation();initAudio();judgeInput(button.dataset.key==="defense"?"right":button.dataset.key);}});
  gameRoot.addEventListener("pointerdown", handlePointer);
  gameRoot.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("keydown",handleKey);
  window.addEventListener("resize",resize);

  makePips(ui.playerAp,3);makePips(ui.stagger,5);resize();updateHud();requestAnimationFrame(frame);
})();
