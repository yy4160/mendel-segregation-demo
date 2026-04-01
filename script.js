/*
  孟德尔分离定律动画模拟（Dd × Dd）
  - 母本桶（雌配子）：D=10, d=10
  - 父本桶（雄配子）：D=50, d=50
  - 每轮：先抽雌，再抽雄 -> 组合 -> 统计 -> 放回 -> 再摇匀
*/

(() => {
  "use strict";

  const CONFIG = {
    maleD: 50,
    maled: 50,
    femaleD: 10,
    femaled: 10,
    defaultTotalTrials: 100,
    fps: 60,
    // 基础时长（毫秒），会被 speedScale 调整
    phaseDuration: {
      shuffle: 800,
      pickFemale: 700,
      pickMale: 700,
      showCombine: 900,
      returnBalls: 700,
    },
  };

  const canvas = document.getElementById("simCanvas");
  const ctx = canvas.getContext("2d");

  const $ = (id) => document.getElementById(id);
  const ui = {
    trialCount: $("trialCount"),
    countDD: $("countDD"),
    countDd: $("countDd"),
    countdd: $("countdd"),
    ratioDD: $("ratioDD"),
    ratioDd: $("ratioDd"),
    ratiodd: $("ratiodd"),
    finalReport: $("finalReport"),
    totalTrialsInput: $("totalTrialsInput"),
    speedInput: $("speedInput"),
    speedText: $("speedText"),
    pauseBtn: $("pauseBtn"),
    resetBtn: $("resetBtn"),
  };

  // 左侧两个桶区域
  const bucketFemale = { x: 70, y: 130, w: 290, h: 400, title: "母本桶（雌配子）", color: "#ef4444" };
  const bucketMale = { x: 390, y: 90, w: 290, h: 440, title: "父本桶（雄配子）", color: "#3b82f6" };

  // 中间组合展示区域
  const combineSpotFemale = { x: 760, y: 220 };
  const combineSpotMale = { x: 840, y: 220 };

  let state = null;

  function createBucketBalls(countD, countd, bucket, cols) {
    const balls = [];
    const total = countD + countd;
    const radius = total > 60 ? 10 : 14;
    const cellW = Math.floor((bucket.w - 40) / cols);
    const rows = Math.ceil(total / cols);
    const cellH = Math.max(20, Math.floor((bucket.h - 80) / rows));

    const alleles = [];
    for (let i = 0; i < countD; i += 1) alleles.push("D");
    for (let i = 0; i < countd; i += 1) alleles.push("d");

    for (let i = 0; i < alleles.length; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = bucket.x + 20 + col * cellW + cellW / 2;
      const by = bucket.y + 50 + row * cellH + cellH / 2;
      balls.push({
        allele: alleles[i],
        baseX: bx,
        baseY: by,
        x: bx,
        y: by,
        r: radius,
        hidden: false,
        mixSeedX: Math.random() * Math.PI * 2,
        mixSeedY: Math.random() * Math.PI * 2,
        mixRadiusX: 6 + Math.random() * 10,
        mixRadiusY: 5 + Math.random() * 8,
        mixSpeed: 1.2 + Math.random() * 1.8,
        drumLag: 0.75 + Math.random() * 0.55,
      });
    }
    return balls;
  }

  function normalizeGenotype(a, b) {
    const p = [a, b].sort((x, y) => (x === "D" ? -1 : 1)).join("");
    return p;
  }

  function fmtRatio(value, total) {
    if (total <= 0) return "0.00%";
    return `${((value / total) * 100).toFixed(2)}%`;
  }

  function gcd(a, b) {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y !== 0) {
      const temp = x % y;
      x = y;
      y = temp;
    }
    return x || 1;
  }

  function formatCountRatio(ddCount, ddHeteroCount, ddRecessiveCount) {
    const base = gcd(gcd(ddCount, ddHeteroCount), ddRecessiveCount);
    return `${Math.round(ddCount / base)} : ${Math.round(ddHeteroCount / base)} : ${Math.round(ddRecessiveCount / base)}`;
  }

  function assessGenotypeCloseness(obsDD, obsDd, obsdd) {
    const diffDD = Math.abs(obsDD - 0.25);
    const diffDd = Math.abs(obsDd - 0.5);
    const diffdd = Math.abs(obsdd - 0.25);
    const maxDiff = Math.max(diffDD, diffDd, diffdd);

    if (maxDiff <= 0.03) {
      return "非常接近 1:2:1";
    }
    if (maxDiff <= 0.08) {
      return "接近 1:2:1";
    }
    return "暂时不够接近 1:2:1，建议增加实验次数后再观察";
  }

  function resetSimulation() {
    const totalTrials = Number.parseInt(ui.totalTrialsInput.value, 10);
    state = {
      totalTrials: Number.isFinite(totalTrials) && totalTrials > 0 ? totalTrials : CONFIG.defaultTotalTrials,
      speedScale: Number.parseFloat(ui.speedInput.value) || 1,
      running: true,
      phase: "shuffle",
      phaseElapsed: 0,
      trial: 0,
      counts: { DD: 0, Dd: 0, dd: 0 },
      femaleBalls: createBucketBalls(CONFIG.femaleD, CONFIG.femaled, bucketFemale, 5),
      maleBalls: createBucketBalls(CONFIG.maleD, CONFIG.maled, bucketMale, 10),
      pickedFemaleIndex: -1,
      pickedMaleIndex: -1,
      flyingFemale: null,
      flyingMale: null,
      currentText: "初始化并摇匀中...",
      lastTimestamp: performance.now(),
      finished: false,
      mixClock: 0,
    };

    ui.pauseBtn.textContent = "暂停";
    ui.finalReport.textContent = "实验进行中...";
    updateStatsPanel();
  }

  function pickRandomIndex(arr) {
    return Math.floor(Math.random() * arr.length);
  }

  function getDuration(phaseName) {
    const base = CONFIG.phaseDuration[phaseName] || 500;
    // speedScale 越大，动画越快
    return base / Math.max(0.1, state.speedScale);
  }

  function beginPhase(phaseName) {
    state.phase = phaseName;
    state.phaseElapsed = 0;
  }

  function update(dt) {
    if (!state || !state.running || state.finished) return;

    state.speedScale = Number.parseFloat(ui.speedInput.value) || 1;
    state.phaseElapsed += dt;
    state.mixClock += dt / 1000;

    const femaleBalls = state.femaleBalls;
    const maleBalls = state.maleBalls;

    if (state.phase === "shuffle") {
      state.currentText = "摇匀中（模拟充分混匀）...";
      if (state.phaseElapsed >= getDuration("shuffle")) {
        // 每轮开始：按要求先抽母本再抽父本
        state.pickedFemaleIndex = pickRandomIndex(femaleBalls);
        state.flyingFemale = {
          allele: femaleBalls[state.pickedFemaleIndex].allele,
          r: femaleBalls[state.pickedFemaleIndex].r,
          fromX: femaleBalls[state.pickedFemaleIndex].x,
          fromY: femaleBalls[state.pickedFemaleIndex].y,
          toX: combineSpotFemale.x,
          toY: combineSpotFemale.y,
          x: femaleBalls[state.pickedFemaleIndex].x,
          y: femaleBalls[state.pickedFemaleIndex].y,
        };
        femaleBalls[state.pickedFemaleIndex].hidden = true;
        beginPhase("pickFemale");
      }
      return;
    }

    if (state.phase === "pickFemale") {
      state.currentText = "步骤1：从母本桶随机抓取 1 个配子";
      const p = Math.min(1, state.phaseElapsed / getDuration("pickFemale"));
      state.flyingFemale.x = state.flyingFemale.fromX + (state.flyingFemale.toX - state.flyingFemale.fromX) * p;
      state.flyingFemale.y = state.flyingFemale.fromY + (state.flyingFemale.toY - state.flyingFemale.fromY) * p;
      if (p >= 1) {
        state.pickedMaleIndex = pickRandomIndex(maleBalls);
        state.flyingMale = {
          allele: maleBalls[state.pickedMaleIndex].allele,
          r: maleBalls[state.pickedMaleIndex].r,
          fromX: maleBalls[state.pickedMaleIndex].x,
          fromY: maleBalls[state.pickedMaleIndex].y,
          toX: combineSpotMale.x,
          toY: combineSpotMale.y,
          x: maleBalls[state.pickedMaleIndex].x,
          y: maleBalls[state.pickedMaleIndex].y,
        };
        maleBalls[state.pickedMaleIndex].hidden = true;
        beginPhase("pickMale");
      }
      return;
    }

    if (state.phase === "pickMale") {
      state.currentText = "步骤2：从父本桶随机抓取 1 个配子";
      const p = Math.min(1, state.phaseElapsed / getDuration("pickMale"));
      state.flyingMale.x = state.flyingMale.fromX + (state.flyingMale.toX - state.flyingMale.fromX) * p;
      state.flyingMale.y = state.flyingMale.fromY + (state.flyingMale.fromY > state.flyingMale.toY
        ? (state.flyingMale.toY - state.flyingMale.fromY) * p
        : (state.flyingMale.toY - state.flyingMale.fromY) * p);

      if (p >= 1) {
        const genotype = normalizeGenotype(state.flyingFemale.allele, state.flyingMale.allele);
        state.currentText = `${state.flyingFemale.allele} + ${state.flyingMale.allele} -> ${genotype}`;
        if (genotype === "DD") state.counts.DD += 1;
        if (genotype === "Dd") state.counts.Dd += 1;
        if (genotype === "dd") state.counts.dd += 1;

        state.trial += 1;
        updateStatsPanel();
        beginPhase("showCombine");
      }
      return;
    }

    if (state.phase === "showCombine") {
      state.currentText = `步骤3：组合结果 ${state.flyingFemale.allele} + ${state.flyingMale.allele} -> ${normalizeGenotype(state.flyingFemale.allele, state.flyingMale.allele)}`;
      if (state.phaseElapsed >= getDuration("showCombine")) {
        // 返回原桶，体现“抽后放回”
        state.flyingFemale.fromX = state.flyingFemale.x;
        state.flyingFemale.fromY = state.flyingFemale.y;
        state.flyingFemale.toX = state.femaleBalls[state.pickedFemaleIndex].baseX;
        state.flyingFemale.toY = state.femaleBalls[state.pickedFemaleIndex].baseY;

        state.flyingMale.fromX = state.flyingMale.x;
        state.flyingMale.fromY = state.flyingMale.y;
        state.flyingMale.toX = state.maleBalls[state.pickedMaleIndex].baseX;
        state.flyingMale.toY = state.maleBalls[state.pickedMaleIndex].baseY;

        beginPhase("returnBalls");
      }
      return;
    }

    if (state.phase === "returnBalls") {
      state.currentText = "步骤4：放回原桶并再次摇匀";
      const p = Math.min(1, state.phaseElapsed / getDuration("returnBalls"));

      state.flyingFemale.x = state.flyingFemale.fromX + (state.flyingFemale.toX - state.flyingFemale.fromX) * p;
      state.flyingFemale.y = state.flyingFemale.fromY + (state.flyingFemale.toY - state.flyingFemale.fromY) * p;

      state.flyingMale.x = state.flyingMale.fromX + (state.flyingMale.toX - state.flyingMale.fromX) * p;
      state.flyingMale.y = state.flyingMale.fromY + (state.flyingMale.toY - state.flyingMale.fromY) * p;

      if (p >= 1) {
        state.femaleBalls[state.pickedFemaleIndex].hidden = false;
        state.maleBalls[state.pickedMaleIndex].hidden = false;
        state.flyingFemale = null;
        state.flyingMale = null;

        if (state.trial >= state.totalTrials) {
          state.finished = true;
          state.running = false;
          state.currentText = "实验完成";
          ui.pauseBtn.textContent = "继续";
          updateFinalReport();
        } else {
          beginPhase("shuffle");
        }
      }
    }
  }

  function drawBucket(bucket, balls, isShuffle) {
    ctx.save();
    const centerX = bucket.x + bucket.w / 2;
    const centerY = bucket.y + bucket.h / 2 + 16;

    // 桶体
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, bucket.x, bucket.y, bucket.w, bucket.h, 18, true, false);
    ctx.strokeStyle = "#5a7184";
    ctx.lineWidth = 3;
    roundRect(ctx, bucket.x, bucket.y, bucket.w, bucket.h, 18, false, true);

    // 标题条
    ctx.fillStyle = bucket.color;
    roundRect(ctx, bucket.x, bucket.y - 36, bucket.w, 30, 10, true, false);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 15px Microsoft YaHei";
    ctx.fillText(bucket.title, bucket.x + 10, bucket.y - 16);

    if (isShuffle) {
      const swirlAlpha = 0.18 + 0.08 * (1 + Math.sin(state.mixClock * 7));
      ctx.strokeStyle = `rgba(15, 23, 42, ${swirlAlpha.toFixed(3)})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i += 1) {
        const arcY = bucket.y + 95 + i * 105;
        ctx.beginPath();
        ctx.arc(bucket.x + bucket.w / 2, arcY, 58, Math.PI * 0.2, Math.PI * 1.55);
        ctx.stroke();
      }

      ctx.strokeStyle = `rgba(59, 130, 246, ${(swirlAlpha + 0.1).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(centerX, centerY, Math.min(bucket.w, bucket.h) * 0.28, 0.2, Math.PI * 1.85);
      ctx.stroke();
    }

    // 画球
    for (const ball of balls) {
      if (ball.hidden) continue;

      let x = ball.baseX;
      let y = ball.baseY;

      if (isShuffle) {
        const relX = ball.baseX - centerX;
        const relY = ball.baseY - centerY;
        const radiusFactor = Math.min(1, Math.hypot(relX, relY) / (bucket.w * 0.42));
        const angle = state.mixClock * 2.8 * ball.drumLag + radiusFactor * 0.6;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const rotatedX = relX * cosA - relY * sinA;
        const rotatedY = relX * sinA + relY * cosA;

        const orbitBlend = 0.22 + radiusFactor * 0.18;
        const orbitX = relX + (rotatedX - relX) * orbitBlend;
        const orbitY = relY + (rotatedY - relY) * orbitBlend;

        const localMixX = Math.sin(state.mixClock * (ball.mixSpeed + 1.6) + ball.mixSeedX) * ball.mixRadiusX * 0.55;
        const localMixY = Math.cos(state.mixClock * (ball.mixSpeed + 1.2) + ball.mixSeedY) * ball.mixRadiusY * 0.55;

        x = centerX + orbitX + localMixX;
        y = centerY + orbitY + localMixY;

        const minX = bucket.x + 18 + ball.r;
        const maxX = bucket.x + bucket.w - 18 - ball.r;
        const minY = bucket.y + 42 + ball.r;
        const maxY = bucket.y + bucket.h - 18 - ball.r;
        x = Math.max(minX, Math.min(maxX, x));
        y = Math.max(minY, Math.min(maxY, y));
      }

      ball.x = x;
      ball.y = y;

      drawBall(x, y, ball.r, ball.allele);
    }

    ctx.restore();
  }

  function drawBall(x, y, r, allele) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = allele === "D" ? "#facc15" : "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#111827";
    ctx.font = `bold ${Math.max(10, r)}px Microsoft YaHei`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(allele, x, y + 0.5);
  }

  function drawScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 场景背景与标题
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawBucket(bucketFemale, state.femaleBalls, state.phase === "shuffle" && state.running);
    drawBucket(bucketMale, state.maleBalls, state.phase === "shuffle" && state.running);

    // 中间组合区
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 20px Microsoft YaHei";
    ctx.textAlign = "left";
    ctx.fillText("组合观察区", 710, 80);

    ctx.strokeStyle = "#94a3b8";
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(700, 100, 250, 220);
    ctx.setLineDash([]);

    if (state.flyingFemale) {
      drawBall(state.flyingFemale.x, state.flyingFemale.y, state.flyingFemale.r + 2, state.flyingFemale.allele);
      ctx.fillStyle = "#ef4444";
      ctx.font = "13px Microsoft YaHei";
      ctx.fillText("母本配子", state.flyingFemale.x - 20, state.flyingFemale.y - 20);
    }

    if (state.flyingMale) {
      drawBall(state.flyingMale.x, state.flyingMale.y, state.flyingMale.r + 2, state.flyingMale.allele);
      ctx.fillStyle = "#3b82f6";
      ctx.font = "13px Microsoft YaHei";
      ctx.fillText("父本配子", state.flyingMale.x - 20, state.flyingMale.y - 20);
    }

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 24px Microsoft YaHei";
    ctx.fillText(state.currentText, 40, 585);

    // 每轮核心原则提示
    ctx.fillStyle = "#334155";
    ctx.font = "14px Microsoft YaHei";
    ctx.fillText("规则：每轮先抽雌后抽雄，组合后放回并摇匀；保证概率稳定。", 40, 612);
  }

  function updateStatsPanel() {
    const t = state.trial;
    ui.trialCount.textContent = String(t);
    ui.countDD.textContent = String(state.counts.DD);
    ui.countDd.textContent = String(state.counts.Dd);
    ui.countdd.textContent = String(state.counts.dd);

    ui.ratioDD.textContent = fmtRatio(state.counts.DD, t);
    ui.ratioDd.textContent = fmtRatio(state.counts.Dd, t);
    ui.ratiodd.textContent = fmtRatio(state.counts.dd, t);
  }

  function updateFinalReport() {
    const t = Math.max(1, state.trial);
    const obsDD = state.counts.DD / t;
    const obsDd = state.counts.Dd / t;
    const obsdd = state.counts.dd / t;

    const theoDD = 0.25;
    const theoDd = 0.5;
    const theodd = 0.25;
    const countRatio = formatCountRatio(state.counts.DD, state.counts.Dd, state.counts.dd);
    const closeness = assessGenotypeCloseness(obsDD, obsDd, obsdd);

    const dominant = (state.counts.DD + state.counts.Dd) / t;
    const recessive = state.counts.dd / t;

    const report = [
      `总实验次数：${state.trial}`,
      "",
      `累计次数比 DD : Dd : dd = ${state.counts.DD} : ${state.counts.Dd} : ${state.counts.dd}`,
      `化简参考比 DD : Dd : dd = ${countRatio}`,
      `观察比例 DD : Dd : dd = ${obsDD.toFixed(4)} : ${obsDd.toFixed(4)} : ${obsdd.toFixed(4)}`,
      `理论比例 DD : Dd : dd = ${theoDD.toFixed(4)} : ${theoDd.toFixed(4)} : ${theodd.toFixed(4)}`,
      `判定：${closeness}`,
      `|DD误差| = ${(Math.abs(obsDD - theoDD) * 100).toFixed(2)}%`,
      `|Dd误差| = ${(Math.abs(obsDd - theoDd) * 100).toFixed(2)}%`,
      `|dd误差| = ${(Math.abs(obsdd - theodd) * 100).toFixed(2)}%`,
      "",
      `观察表型比例 显性 : 隐性 = ${dominant.toFixed(4)} : ${recessive.toFixed(4)}`,
      "理论表型比例 显性 : 隐性 = 0.7500 : 0.2500",
      "",
      "说明：实验次数越多，观察结果通常越接近理论值。",
    ].join("\n");

    ui.finalReport.textContent = report;
  }

  function roundRect(c, x, y, w, h, r, fill, stroke) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    if (fill) c.fill();
    if (stroke) c.stroke();
  }

  function loop(now) {
    try {
      const dt = now - state.lastTimestamp;
      state.lastTimestamp = now;
      update(dt);
      drawScene();
    } catch (err) {
      // 异常保护：防止动画循环因单次错误中断
      console.error("动画运行异常：", err);
      state.running = false;
      ui.finalReport.textContent = `程序出现异常：${String(err)}`;
    }
    requestAnimationFrame(loop);
  }

  ui.pauseBtn.addEventListener("click", () => {
    if (!state) return;
    state.running = !state.running;
    ui.pauseBtn.textContent = state.running ? "暂停" : "继续";
    if (state.running) {
      state.lastTimestamp = performance.now();
    }
  });

  ui.resetBtn.addEventListener("click", () => {
    resetSimulation();
  });

  ui.speedInput.addEventListener("input", () => {
    ui.speedText.textContent = `${Number.parseFloat(ui.speedInput.value).toFixed(1)}x`;
  });

  ui.speedText.textContent = `${Number.parseFloat(ui.speedInput.value).toFixed(1)}x`;

  ui.totalTrialsInput.addEventListener("change", () => {
    const n = Number.parseInt(ui.totalTrialsInput.value, 10);
    if (!Number.isFinite(n) || n < 1) {
      ui.totalTrialsInput.value = String(CONFIG.defaultTotalTrials);
    }
  });

  resetSimulation();
  requestAnimationFrame(loop);
})();
