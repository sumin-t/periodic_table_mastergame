/* ============================================================
   원소와 주기율표 마스터 — app.js
   ============================================================ */

/* ------------------------------------------------------------
   ⚠️ 배포 전 필수 설정
   Google Apps Script를 웹앱으로 배포한 뒤 나오는 URL을 아래에 붙여넣으세요.
   (Code.gs 파일과 배포 방법은 함께 전달된 안내를 참고하세요.)
------------------------------------------------------------ */
const GAS_WEB_APP_URL = "https://docs.google.com/spreadsheets/d/1crwQGXTQ0S1bzqXGobwL8Jyed_Fcq8xNNfWDOc7p7y8/edit?usp=sharing";

/* 교사용 관리자 모드 비밀번호 (필요시 변경하세요) */
const ADMIN_PASSWORD = "0108";

/* 실시간 반영을 위한 자동 새로고침 주기 (ms) */
const POLL_INTERVAL = 8000;

/* ------------------------------------------------------------
   원소 데이터 (중2 교육과정 - 1~18번 주요 원소, 1~3주기 대표족)
------------------------------------------------------------ */
const ELEMENTS = [
  { symbol: "H",  name: "수소",     group: 1,  period: 1, category: "nonmetal" },
  { symbol: "He", name: "헬륨",     group: 18, period: 1, category: "noble" },
  { symbol: "Li", name: "리튬",     group: 1,  period: 2, category: "alkali" },
  { symbol: "Be", name: "베릴륨",   group: 2,  period: 2, category: "alkaline" },
  { symbol: "B",  name: "붕소",     group: 13, period: 2, category: "metalloid" },
  { symbol: "C",  name: "탄소",     group: 14, period: 2, category: "nonmetal" },
  { symbol: "N",  name: "질소",     group: 15, period: 2, category: "nonmetal" },
  { symbol: "O",  name: "산소",     group: 16, period: 2, category: "nonmetal" },
  { symbol: "F",  name: "플루오린", group: 17, period: 2, category: "halogen" },
  { symbol: "Ne", name: "네온",     group: 18, period: 2, category: "noble" },
  { symbol: "Na", name: "나트륨",   group: 1,  period: 3, category: "alkali" },
  { symbol: "Mg", name: "마그네슘", group: 2,  period: 3, category: "alkaline" },
  { symbol: "Al", name: "알루미늄", group: 13, period: 3, category: "metalloid" },
  { symbol: "Si", name: "규소",     group: 14, period: 3, category: "metalloid" },
  { symbol: "P",  name: "인",       group: 15, period: 3, category: "nonmetal" },
  { symbol: "S",  name: "황",       group: 16, period: 3, category: "nonmetal" },
  { symbol: "Cl", name: "염소",     group: 17, period: 3, category: "halogen" },
  { symbol: "Ar", name: "아르곤",   group: 18, period: 3, category: "noble" },
];
const GROUPS = [1, 2, 13, 14, 15, 16, 17, 18];
const PERIODS = [1, 2, 3];
const CATEGORY_VARS = {
  alkali: "--cat-alkali", alkaline: "--cat-alkaline", metalloid: "--cat-metalloid",
  nonmetal: "--cat-nonmetal", halogen: "--cat-halogen", noble: "--cat-noble",
};
function elementColor(category) {
  return `var(${CATEGORY_VARS[category] || "--cat-nonmetal"})`;
}
function findElement(symbol) { return ELEMENTS.find(e => e.symbol === symbol); }

/* 분자 미션 데이터 */
const MOLECULES = [
  { formula: "H2O", name: "물", desc: "수소 원자 2개와 산소 원자 1개가 결합한 분자", atoms: { H: 2, O: 1 } },
  { formula: "CO2", name: "이산화 탄소", desc: "탄소 원자 1개와 산소 원자 2개가 결합한 분자", atoms: { C: 1, O: 2 } },
  { formula: "NH3", name: "암모니아", desc: "질소 원자 1개와 수소 원자 3개가 결합한 분자", atoms: { N: 1, H: 3 } },
  { formula: "CH4", name: "메테인", desc: "탄소 원자 1개와 수소 원자 4개가 결합한 분자", atoms: { C: 1, H: 4 } },
  { formula: "NaCl", name: "염화 나트륨", desc: "나트륨 원자 1개와 염소 원자 1개가 결합한 물질", atoms: { Na: 1, Cl: 1 } },
  { formula: "O2", name: "산소 기체", desc: "산소 원자 2개가 결합한 분자", atoms: { O: 2 } },
  { formula: "MgO", name: "산화 마그네슘", desc: "마그네슘 원자 1개와 산소 원자 1개가 결합한 물질", atoms: { Mg: 1, O: 1 } },
];
const MOLECULE_ATOM_POOL = ["H", "C", "N", "O", "Na", "Cl", "Mg"];

function formatFormula(f) { return f.replace(/(\d+)/g, "<sub>$1</sub>"); }

/* ------------------------------------------------------------
   게임 상태
------------------------------------------------------------ */
const state = {
  stage: 1,
  score: { s1: 0, s2: 0, s3: 0 },
  timeUsed: { s1: 0, s2: 0, s3: 0 },
  timerId: null,
  secondsLeft: 0,
  stageSeconds: { 1: 60, 2: 60, 3: 90 },

  s1: { pairs: [], flipped: [], matchedCount: 0, lock: false },
  s2: { blanks: [], selectedSymbol: null, correctCount: 0 },
  s3: { missions: [], missionIndex: 0, workspace: {}, completedCount: 0 },

  lastResult: null,
  registered: false,
  pollTimer: null,
  isAdmin: false,
  adminTab: "class",
};

/* ------------------------------------------------------------
   공통 유틸
------------------------------------------------------------ */
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
function pickRandom(arr, n) { return shuffle(arr).slice(0, n); }

function showScreen(id) {
  $all(".screen").forEach(s => s.classList.remove("active"));
  $(`#${id}`).classList.add("active");
  if (id !== "screen-rankings") stopPolling();
}

function showToast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ------------------------------------------------------------
   타이머
------------------------------------------------------------ */
function startTimer(totalSeconds, onTick, onEnd) {
  clearInterval(state.timerId);
  state.secondsLeft = totalSeconds;
  onTick(state.secondsLeft, totalSeconds);
  state.timerId = setInterval(() => {
    state.secondsLeft--;
    onTick(state.secondsLeft, totalSeconds);
    if (state.secondsLeft <= 0) {
      clearInterval(state.timerId);
      onEnd();
    }
  }, 1000);
}
function stopTimer() { clearInterval(state.timerId); }

function updateTimerDisplay(secondsLeft, total) {
  $("#display-time").textContent = `${Math.max(0, secondsLeft)}초`;
  const pct = Math.max(0, (secondsLeft / total) * 100);
  const bar = $("#timer-bar");
  bar.style.width = pct + "%";
  bar.classList.toggle("warning", secondsLeft <= total * 0.25);
}

function updateScoreDisplay() {
  const total = state.score.s1 + state.score.s2 + state.score.s3;
  $("#display-score").textContent = total;
}

/* ==============================================================
   STAGE 1 — 카드 매칭
============================================================== */
function initStage1() {
  state.stage = 1;
  state.score.s1 = 0;
  $("#display-stage-title").textContent = "STAGE 1: 원소 기호 매칭";
  $("#stage-1-container").classList.remove("d-none");
  $("#stage-2-container").classList.add("d-none");
  $("#stage-3-container").classList.add("d-none");
  updateScoreDisplay();

  const chosen = pickRandom(ELEMENTS, 8);
  const cards = [];
  chosen.forEach(el => {
    cards.push({ key: el.symbol, face: "name", el });
    cards.push({ key: el.symbol, face: "symbol", el });
  });
  state.s1 = { pairs: shuffle(cards), flipped: [], matchedCount: 0, lock: false };

  const grid = $("#card-grid");
  grid.innerHTML = "";
  state.s1.pairs.forEach((card, idx) => {
    const div = document.createElement("div");
    div.className = "match-card";
    div.dataset.idx = idx;
    div.innerHTML = `
      <div class="match-card-inner">
        <div class="match-card-face match-card-front"><i class="fa-solid fa-flask-vial"></i></div>
        <div class="match-card-face match-card-back" style="--tile-color:${elementColor(card.el.category)}">
          ${card.face === "symbol"
            ? `<span class="tile-symbol">${card.el.symbol}</span><span class="tile-name">기호</span>`
            : `<span class="tile-symbol" style="font-size:20px;">${card.el.name}</span><span class="tile-name">이름</span>`}
        </div>
      </div>`;
    div.addEventListener("click", () => onCardClick(idx));
    grid.appendChild(div);
  });

  startTimer(state.stageSeconds[1], updateTimerDisplay, () => finishStage1(true));
}

function onCardClick(idx) {
  const s = state.s1;
  if (s.lock) return;
  const cardEl = $(`.match-card[data-idx="${idx}"]`);
  if (!cardEl || cardEl.classList.contains("matched") || cardEl.classList.contains("flipped")) return;

  cardEl.classList.add("flipped");
  s.flipped.push(idx);

  if (s.flipped.length === 2) {
    s.lock = true;
    const [i1, i2] = s.flipped;
    const c1 = s.pairs[i1], c2 = s.pairs[i2];
    const isMatch = c1.key === c2.key && c1.face !== c2.face;
    setTimeout(() => {
      const el1 = $(`.match-card[data-idx="${i1}"]`), el2 = $(`.match-card[data-idx="${i2}"]`);
      if (isMatch) {
        el1.classList.add("matched"); el2.classList.add("matched");
        state.score.s1 += 50;
        s.matchedCount++;
        updateScoreDisplay();
        if (s.matchedCount === s.pairs.length / 2) finishStage1(false);
      } else {
        el1.classList.remove("flipped"); el2.classList.remove("flipped");
        el1.classList.add("shake"); el2.classList.add("shake");
        setTimeout(() => { el1.classList.remove("shake"); el2.classList.remove("shake"); }, 400);
      }
      s.flipped = [];
      s.lock = false;
    }, 700);
  }
}

function finishStage1(timedOut) {
  stopTimer();
  state.timeUsed.s1 = state.stageSeconds[1] - Math.max(0, state.secondsLeft);
  if (timedOut) showToast("STAGE 1 시간 종료!");
  setTimeout(initStage2, timedOut ? 600 : 300);
}

/* ==============================================================
   STAGE 2 — 주기율표 퍼즐
============================================================== */
function buildPeriodicModel() {
  const cells = [];
  PERIODS.forEach(period => {
    GROUPS.forEach(group => {
      const isMainPeriod1Gap = period === 1 && group !== 1 && group !== 18;
      if (isMainPeriod1Gap) {
        cells.push({ period, group, type: "gap" });
      } else {
        const el = ELEMENTS.find(e => e.period === period && e.group === group);
        cells.push({ period, group, type: "element", el });
      }
    });
  });
  return cells;
}

function initStage2() {
  state.stage = 2;
  state.score.s2 = 0;
  $("#display-stage-title").textContent = "STAGE 2: 주기율표 빈칸 넣기";
  $("#stage-1-container").classList.add("d-none");
  $("#stage-2-container").classList.remove("d-none");
  $("#stage-3-container").classList.add("d-none");
  updateScoreDisplay();

  const model = buildPeriodicModel();
  const elementCells = model.filter(c => c.type === "element");
  const blankTargets = pickRandom(elementCells, 6);
  const blankSymbols = new Set(blankTargets.map(c => c.el.symbol));

  state.s2 = { blanks: blankTargets.map(c => c.el.symbol), selectedSymbol: null, correctCount: 0 };

  const grid = $("#periodic-table-grid");
  grid.innerHTML = "";
  model.forEach(cell => {
    const div = document.createElement("div");
    if (cell.type === "gap") {
      div.className = "pt-cell pt-empty-space";
    } else if (blankSymbols.has(cell.el.symbol)) {
      div.className = "pt-cell pt-blank";
      div.dataset.symbol = cell.el.symbol;
      div.textContent = "?";
      div.addEventListener("click", () => onBlankCellClick(div, cell.el.symbol));
    } else {
      div.className = "pt-cell pt-filled";
      div.style.setProperty("--tile-color", elementColor(cell.el.category));
      div.innerHTML = `<span class="pt-symbol">${cell.el.symbol}</span>`;
    }
    grid.appendChild(div);
  });

  const dock = $("#element-dock");
  dock.innerHTML = "";
  shuffle(blankTargets).forEach(c => {
    const el = c.el;
    const tile = document.createElement("div");
    tile.className = "dock-tile";
    tile.dataset.symbol = el.symbol;
    tile.style.setProperty("--tile-color", elementColor(el.category));
    tile.innerHTML = `<span class="dt-symbol">${el.symbol}</span><span class="dt-name">${el.name}</span>`;
    tile.addEventListener("click", () => onDockTileClick(tile, el.symbol));
    dock.appendChild(tile);
  });

  startTimer(state.stageSeconds[2], updateTimerDisplay, () => finishStage2(true));
}

function onDockTileClick(tileEl, symbol) {
  if (tileEl.classList.contains("used")) return;
  $all(".dock-tile.selected").forEach(t => t.classList.remove("selected"));
  tileEl.classList.add("selected");
  state.s2.selectedSymbol = symbol;
}

function onBlankCellClick(cellEl, targetSymbol) {
  if (cellEl.classList.contains("pt-correct")) return;
  const sel = state.s2.selectedSymbol;
  if (!sel) { showToast("먼저 아래에서 원소를 선택하세요."); return; }

  const tile = $(`.dock-tile[data-symbol="${sel}"]`);
  if (sel === targetSymbol) {
    const el = findElement(sel);
    cellEl.classList.remove("pt-blank");
    cellEl.classList.add("pt-filled", "pt-correct");
    cellEl.style.setProperty("--tile-color", elementColor(el.category));
    cellEl.innerHTML = `<span class="pt-symbol">${el.symbol}</span>`;
    if (tile) tile.classList.add("used");
    state.score.s2 += 50;
    state.s2.correctCount++;
    updateScoreDisplay();
    state.s2.selectedSymbol = null;
    if (state.s2.correctCount === state.s2.blanks.length) finishStage2(false);
  } else {
    state.score.s2 = Math.max(0, state.score.s2 - 10);
    updateScoreDisplay();
    cellEl.classList.add("pt-wrong");
    setTimeout(() => cellEl.classList.remove("pt-wrong"), 400);
    showToast("다른 원소예요! 다시 선택해보세요.");
  }
}

function finishStage2(timedOut) {
  stopTimer();
  state.timeUsed.s2 = state.stageSeconds[2] - Math.max(0, state.secondsLeft);
  if (timedOut) showToast("STAGE 2 시간 종료!");
  setTimeout(initStage3, timedOut ? 600 : 300);
}

/* ==============================================================
   STAGE 3 — 분자 조립
============================================================== */
function initStage3() {
  state.stage = 3;
  state.score.s3 = 0;
  $("#display-stage-title").textContent = "STAGE 3: 분자 완성하기";
  $("#stage-1-container").classList.add("d-none");
  $("#stage-2-container").classList.add("d-none");
  $("#stage-3-container").classList.remove("d-none");
  updateScoreDisplay();

  state.s3 = { missions: pickRandom(MOLECULES, 3), missionIndex: 0, workspace: {}, completedCount: 0 };

  const drawer = $("#atoms-drawer");
  drawer.innerHTML = "";
  MOLECULE_ATOM_POOL.forEach(symbol => {
    const el = findElement(symbol);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "atom-source";
    btn.style.setProperty("--tile-color", elementColor(el.category));
    btn.innerHTML = `${symbol}<span class="as-name">${el.name}</span>`;
    btn.addEventListener("click", () => addAtomToWorkspace(symbol));
    drawer.appendChild(btn);
  });

  renderMoleculeMission();
  startTimer(state.stageSeconds[3], updateTimerDisplay, () => finishStage3(true));
}

function renderMoleculeMission() {
  const mission = state.s3.missions[state.s3.missionIndex];
  $("#molecule-name").textContent = mission.name;
  $("#molecule-formula").innerHTML = formatFormula(mission.formula);
  $("#molecule-desc").textContent = mission.desc;
  $("#molecule-progress").textContent = `${state.s3.missionIndex + 1} / ${state.s3.missions.length}`;
  state.s3.workspace = {};
  renderWorkspace();
}

function addAtomToWorkspace(symbol) {
  state.s3.workspace[symbol] = (state.s3.workspace[symbol] || 0) + 1;
  renderWorkspace();
}

function renderWorkspace() {
  const ws = $("#molecule-workspace");
  const entries = Object.entries(state.s3.workspace).filter(([, n]) => n > 0);
  ws.innerHTML = "";
  if (entries.length === 0) {
    ws.innerHTML = `<div class="workspace-empty-message" id="workspace-empty-msg"><i class="fa-solid fa-flask"></i><span>원자 보관함에서 원자를 추가하여 분자를 조립하세요.</span></div>`;
  } else {
    entries.forEach(([symbol, count]) => {
      const el = findElement(symbol);
      for (let i = 0; i < count; i++) {
        const chip = document.createElement("div");
        chip.className = "atom-chip";
        chip.style.setProperty("--tile-color", elementColor(el.category));
        chip.textContent = symbol;
        chip.title = "클릭해서 제거";
        chip.addEventListener("click", () => removeAtomFromWorkspace(symbol));
        ws.appendChild(chip);
      }
    });
  }
  const formulaText = entries.length
    ? entries.map(([s, n]) => s + (n > 1 ? n : "")).join("")
    : "원자 없음";
  $("#molecule-current-formula").textContent = formulaText;
}

function removeAtomFromWorkspace(symbol) {
  if (!state.s3.workspace[symbol]) return;
  state.s3.workspace[symbol]--;
  renderWorkspace();
}

$("#btn-clear-workspace")?.addEventListener("click", () => {
  state.s3.workspace = {};
  renderWorkspace();
});

$("#btn-submit-molecule")?.addEventListener("click", () => {
  const mission = state.s3.missions[state.s3.missionIndex];
  const target = mission.atoms;
  const current = state.s3.workspace;
  const targetKeys = Object.keys(target);
  const currentKeys = Object.keys(current).filter(k => current[k] > 0);
  const isMatch = targetKeys.length === currentKeys.length &&
    targetKeys.every(k => (current[k] || 0) === target[k]);

  if (isMatch) {
    state.score.s3 += 100;
    state.s3.completedCount++;
    updateScoreDisplay();
    showToast(`${mission.name} 완성! 🎉`);
    state.s3.missionIndex++;
    if (state.s3.missionIndex >= state.s3.missions.length) {
      finishStage3(false);
    } else {
      renderMoleculeMission();
    }
  } else {
    state.score.s3 = Math.max(0, state.score.s3 - 10);
    updateScoreDisplay();
    showToast("분자식이 정확하지 않아요. 원자 개수를 다시 확인하세요!");
  }
});

function finishStage3(timedOut) {
  stopTimer();
  state.timeUsed.s3 = state.stageSeconds[3] - Math.max(0, state.secondsLeft);
  if (timedOut) showToast("STAGE 3 시간 종료!");
  setTimeout(finishGame, timedOut ? 600 : 300);
}

/* ==============================================================
   게임 종료 / 결과 처리
============================================================== */
function finishGame() {
  const totalTimeAllowed = state.stageSeconds[1] + state.stageSeconds[2] + state.stageSeconds[3];
  const totalTimeUsed = state.timeUsed.s1 + state.timeUsed.s2 + state.timeUsed.s3;
  const remaining = Math.max(0, totalTimeAllowed - totalTimeUsed);
  const timeBonus = Math.round(remaining * 2);
  const total = state.score.s1 + state.score.s2 + state.score.s3 + timeBonus;

  state.lastResult = {
    stage1: state.score.s1, stage2: state.score.s2, stage3: state.score.s3,
    timeBonus, total, timeUsedSeconds: totalTimeUsed,
  };
  state.registered = false;

  $("#player-final-score").textContent = `${total}점`;
  $("#breakdown-s1").textContent = state.score.s1;
  $("#breakdown-s2").textContent = state.score.s2;
  $("#breakdown-s3").textContent = state.score.s3;
  $("#breakdown-bonus").textContent = timeBonus;
  $("#play-result-banner").classList.remove("d-none");
  $("#register-form").classList.remove("d-none");
  $("#my-rank-callout").classList.remove("show");
  $("#register-status").textContent = "";
  $("#register-status").className = "register-status";
  $("#register-form").reset();

  showScreen("screen-rankings");
  loadClassLeaderboard($("#board-class-select").value);
  startPolling();
}

/* ==============================================================
   구글 스프레드시트 연동 (Google Apps Script Web App)
============================================================== */
function isGasConfigured() {
  return GAS_WEB_APP_URL && GAS_WEB_APP_URL.startsWith("http");
}

async function gasGet(params) {
  if (!isGasConfigured()) throw new Error("NOT_CONFIGURED");
  const url = new URL(GAS_WEB_APP_URL);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: "GET" });
  return res.json();
}

async function gasPost(payload) {
  if (!isGasConfigured()) throw new Error("NOT_CONFIGURED");
  const res = await fetch(GAS_WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // preflight(OPTIONS) 회피용 - 변경하지 마세요
    body: JSON.stringify(payload),
  });
  return res.json();
}

let allRowsCache = [];

async function fetchAllRows() {
  const result = await gasGet({ action: "rankings" });
  if (!result || result.success !== true) throw new Error(result && result.error || "FETCH_FAILED");
  allRowsCache = result.data || [];
  return allRowsCache;
}

function bestScoresByStudent(rows) {
  const map = new Map();
  rows.forEach(r => {
    const key = `${r.class}|${r.nickname}`;
    if (!map.has(key) || r.total > map.get(key).total) map.set(key, r);
  });
  return Array.from(map.values());
}

function sortDesc(rows) { return rows.slice().sort((a, b) => b.total - a.total); }

async function loadClassLeaderboard(classValue) {
  const body = $("#leaderboard-body");
  const noMsg = $("#no-rank-message");
  if (!isGasConfigured()) {
    body.innerHTML = "";
    noMsg.classList.remove("d-none");
    noMsg.querySelector("p").textContent = "구글 스프레드시트 연동이 아직 설정되지 않았습니다. (선생님께 문의하세요)";
    return;
  }
  try {
    const rows = await fetchAllRows();
    const classRows = sortDesc(bestScoresByStudent(rows.filter(r => String(r.class) === String(classValue))));
    renderLeaderboardTable(classRows);
    updateMyRankCallout(rows);
  } catch (err) {
    body.innerHTML = "";
    noMsg.classList.remove("d-none");
    noMsg.querySelector("p").textContent = "랭킹을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
  }
}

function renderLeaderboardTable(rows) {
  const body = $("#leaderboard-body");
  const noMsg = $("#no-rank-message");
  body.innerHTML = "";
  if (rows.length === 0) {
    noMsg.classList.remove("d-none");
    noMsg.querySelector("p").textContent = "아직 기록된 랭킹 데이터가 없습니다. 첫 게임의 주인공이 되어보세요!";
    return;
  }
  noMsg.classList.add("d-none");
  const myNickname = ($("#register-nickname") && $("#register-nickname").value || "").trim();
  rows.forEach((r, idx) => {
    const tr = document.createElement("tr");
    const rank = idx + 1;
    if (rank <= 3) tr.classList.add(`rank-${rank}`);
    if (state.registered && myNickname && r.nickname === myNickname && String(r.class) === String($("#register-class").value)) {
      tr.classList.add("me");
    }
    tr.innerHTML = `<td>${rank}</td><td>${escapeHtml(r.nickname)}</td><td>${r.total}점</td><td>${r.time != null ? r.time + "초" : "-"}</td>`;
    body.appendChild(tr);
  });
}

function updateMyRankCallout(rows) {
  if (!state.registered) return;
  const nickname = $("#register-nickname").value.trim();
  const classVal = $("#register-class").value;
  const best = bestScoresByStudent(rows);
  const sorted = sortDesc(best);
  const idx = sorted.findIndex(r => r.nickname === nickname && String(r.class) === String(classVal));
  if (idx >= 0) {
    $("#my-rank-value").textContent = `${idx + 1}`;
    $("#my-rank-callout").classList.add("show");
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

/* 등록 폼 제출 */
$("#register-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const classVal = $("#register-class").value;
  const nickname = $("#register-nickname").value.trim();
  const statusEl = $("#register-status");

  if (!classVal || !nickname) { showToast("반과 닉네임을 모두 입력해주세요."); return; }
  if (!state.lastResult) { showToast("게임 결과가 없습니다."); return; }
  if (!isGasConfigured()) {
    statusEl.textContent = "⚠️ 구글 스프레드시트 연동 주소가 설정되지 않았습니다.";
    statusEl.className = "register-status error";
    return;
  }

  const btn = $("#btn-register");
  btn.disabled = true;
  statusEl.textContent = "등록 중입니다...";
  statusEl.className = "register-status loading";

  try {
    const payload = {
      class: classVal, nickname,
      total: state.lastResult.total,
      stage1: state.lastResult.stage1, stage2: state.lastResult.stage2, stage3: state.lastResult.stage3,
      time: state.lastResult.timeUsedSeconds,
    };
    const result = await gasPost(payload);
    if (result && result.success) {
      state.registered = true;
      statusEl.textContent = "✅ 명예의 전당에 등록되었습니다!";
      statusEl.className = "register-status success";
      $("#my-rank-value").textContent = result.rank != null ? result.rank : "-";
      $("#my-rank-callout").classList.add("show");
      $("#board-class-select").value = classVal;
      await loadClassLeaderboard(classVal);
    } else {
      throw new Error((result && result.error) || "UNKNOWN");
    }
  } catch (err) {
    statusEl.textContent = "❌ 등록에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해주세요.";
    statusEl.className = "register-status error";
  } finally {
    btn.disabled = false;
  }
});

$("#board-class-select")?.addEventListener("change", (e) => loadClassLeaderboard(e.target.value));

/* 실시간(폴링) 반영 */
function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(() => {
    if (!$("#screen-rankings").classList.contains("active")) return;
    loadClassLeaderboard($("#board-class-select").value);
  }, POLL_INTERVAL);
}
function stopPolling() { clearInterval(state.pollTimer); }

/* ==============================================================
   교사용 관리자 패널
============================================================== */
$("#btn-admin-trigger")?.addEventListener("click", () => {
  $("#admin-modal").classList.add("show");
  $("#admin-auth-section").classList.remove("d-none");
  $("#admin-content-section").classList.add("d-none");
  $("#admin-password").value = "";
  $("#auth-error-msg").classList.add("d-none");
});
$("#btn-close-admin-modal")?.addEventListener("click", () => $("#admin-modal").classList.remove("show"));
$("#admin-modal")?.addEventListener("click", (e) => { if (e.target.id === "admin-modal") $("#admin-modal").classList.remove("show"); });

$("#btn-auth-submit")?.addEventListener("click", authenticateAdmin);
$("#admin-password")?.addEventListener("keydown", (e) => { if (e.key === "Enter") authenticateAdmin(); });

function authenticateAdmin() {
  const pw = $("#admin-password").value;
  if (pw === ADMIN_PASSWORD) {
    state.isAdmin = true;
    $("#admin-auth-section").classList.add("d-none");
    $("#admin-content-section").classList.remove("d-none");
    refreshAdminPanel();
  } else {
    $("#auth-error-msg").classList.remove("d-none");
  }
}

$("#admin-tab-class")?.addEventListener("click", () => setAdminTab("class"));
$("#admin-tab-grade")?.addEventListener("click", () => setAdminTab("grade"));
$("#admin-class-select")?.addEventListener("change", () => { if (state.adminTab === "class") refreshAdminPanel(); });
$("#btn-refresh-admin")?.addEventListener("click", refreshAdminPanel);

function setAdminTab(tab) {
  state.adminTab = tab;
  $("#admin-tab-class").classList.toggle("active", tab === "class");
  $("#admin-tab-grade").classList.toggle("active", tab === "grade");
  $("#admin-class-filter").classList.toggle("d-none", tab !== "class");
  refreshAdminPanel();
}

async function refreshAdminPanel() {
  if (!isGasConfigured()) {
    $("#admin-table-body").innerHTML = `<tr><td colspan="8">구글 스프레드시트 연동 주소가 설정되지 않았습니다.</td></tr>`;
    return;
  }
  try {
    const rows = await fetchAllRows();
    const best = bestScoresByStudent(rows);

    $("#admin-total-count").textContent = `${best.length}명`;
    const top = sortDesc(best)[0];
    $("#admin-top-score").textContent = top ? `${top.total}점` : "0점";
    const classCounts = {};
    best.forEach(r => { classCounts[r.class] = (classCounts[r.class] || 0) + 1; });
    const topClass = Object.entries(classCounts).sort((a, b) => b[1] - a[1])[0];
    $("#admin-top-class").textContent = topClass ? `${topClass[0]}반` : "-";

    let display;
    let title;
    if (state.adminTab === "class") {
      const cls = $("#admin-class-select").value;
      display = sortDesc(best.filter(r => String(r.class) === String(cls)));
      title = `${cls}반 랭킹`;
    } else {
      display = sortDesc(best);
      title = "학년 전체 랭킹";
    }
    $("#admin-table-title").textContent = title;
    renderAdminTable(display);
  } catch (err) {
    $("#admin-table-body").innerHTML = `<tr><td colspan="8">데이터를 불러오지 못했습니다.</td></tr>`;
  }
}

function renderAdminTable(rows) {
  const body = $("#admin-table-body");
  body.innerHTML = "";
  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-faint);">데이터가 없습니다.</td></tr>`;
    return;
  }
  rows.forEach((r, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${idx + 1}</td><td>${escapeHtml(r.class)}반</td><td>${escapeHtml(r.nickname)}</td><td>${r.total}</td><td>${r.s1 ?? "-"}</td><td>${r.s2 ?? "-"}</td><td>${r.s3 ?? "-"}</td><td>${r.time ?? "-"}초</td>`;
    body.appendChild(tr);
  });
}

$("#btn-export-csv")?.addEventListener("click", async () => {
  try {
    const rows = await fetchAllRows();
    const header = ["반", "닉네임", "총점", "1단계 점수", "2단계 점수", "3단계 점수", "시간(초)", "현재 랭킹"];
    const lines = [header.join(",")];
    rows.forEach(r => {
      lines.push([r.class, r.nickname, r.total, r.s1, r.s2, r.s3, r.time, r.rank].map(v => `"${v ?? ""}"`).join(","));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `원소주기율표마스터_랭킹_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  } catch (err) {
    showToast("CSV 다운로드에 실패했습니다.");
  }
});

$("#btn-reset-rankings")?.addEventListener("click", async () => {
  if (!confirm("정말 모든 랭킹 데이터를 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
  if (!confirm("한 번 더 확인합니다. 스프레드시트의 모든 기록이 삭제됩니다. 계속하시겠습니까?")) return;
  try {
    const result = await gasPost({ action: "resetAll", adminPassword: ADMIN_PASSWORD });
    if (result && result.success) {
      showToast("모든 데이터가 초기화되었습니다.");
      refreshAdminPanel();
    } else {
      throw new Error();
    }
  } catch (err) {
    showToast("초기화에 실패했습니다.");
  }
});

/* ==============================================================
   화면 네비게이션 / 초기화
============================================================== */
$("#btn-start")?.addEventListener("click", () => {
  showScreen("screen-game");
  initStage1();
});
$("#btn-view-rankings")?.addEventListener("click", () => {
  $("#play-result-banner").classList.add("d-none");
  showScreen("screen-rankings");
  loadClassLeaderboard($("#board-class-select").value);
  startPolling();
});
$("#btn-back-home")?.addEventListener("click", () => {
  stopPolling();
  showScreen("screen-home");
});

document.addEventListener("DOMContentLoaded", () => {
  if (!isGasConfigured()) {
    console.warn("GAS_WEB_APP_URL이 설정되지 않았습니다. app.js 상단에서 배포된 웹앱 URL로 교체하세요.");
  }
});
