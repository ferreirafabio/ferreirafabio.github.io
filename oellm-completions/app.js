const LANG_LABEL = { fr: "French", de: "German", fi: "Finnish" };
const LANG_FLAG = { fr: "🇫🇷", de: "🇩🇪", fi: "🇫🇮" };

const GROUP_ORDER = ["base", "sft-baseline", "A-75en", "A-25en"];
const GROUP_LABEL = {
    base: "Pre-SFT base",
    "sft-baseline": "SFT baseline",
    "A-75en": "A-75en",
    "A-25en": "A-25en",
};
const GROUP_TITLE = {
    base: "OLMo-3-1025-7B (no SFT)",
    "sft-baseline": "OLMo-3-7B-Instruct-SFT-v2",
    "A-75en": "Dolci-Translated A-75en (75% en, 25% translated)",
    "A-25en": "Dolci-Translated A-25en (25% en, 75% translated)",
};

let DATA = null;
let modelsByGroup = {};
let promptsByLang = {};

const ui = {
    lang: document.getElementById("lang-segmented"),
    mode: document.getElementById("mode-segmented"),
    modelPills: document.getElementById("model-pills"),
    modelsHint: document.getElementById("models-hint"),
    counter: document.getElementById("prompt-counter"),
    prev: document.getElementById("prev-prompt"),
    next: document.getElementById("next-prompt"),
    jump: document.getElementById("prompt-jump"),
    randomBtn: document.getElementById("random-prompt"),
    browseBtn: document.getElementById("browse-toggle"),
    browseClose: document.getElementById("browse-close"),
    browseDrawer: document.getElementById("browse-drawer"),
    browseSearch: document.getElementById("browse-search"),
    browseList: document.getElementById("browse-list"),
    promptText: document.getElementById("prompt-text"),
    promptMeta: document.getElementById("prompt-display-meta"),
    results: document.getElementById("results"),
    meta: document.getElementById("meta"),
};

const state = {
    lang: null,
    promptIdx: 0,
    mode: "compare",
    selectedGroups: new Set(GROUP_ORDER),
    cardSteps: {},
};

async function load() {
    const resp = await fetch("completions.json");
    DATA = await resp.json();

    modelsByGroup = {};
    for (const m of DATA.models) {
        (modelsByGroup[m.group] ||= []).push(m);
    }
    for (const g of Object.keys(modelsByGroup)) {
        modelsByGroup[g].sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
        // default each group to its final ckpt (rightmost on slider)
        const last = modelsByGroup[g][modelsByGroup[g].length - 1];
        state.cardSteps[g] = last.id;
    }

    promptsByLang = {};
    for (const p of DATA.prompts) {
        (promptsByLang[p.lang] ||= []).push(p);
    }
    // sort prompts by index for deterministic order
    for (const lang of Object.keys(promptsByLang)) {
        promptsByLang[lang].sort((a, b) => a.idx - b.idx);
    }

    state.lang = Object.keys(promptsByLang)[0];

    buildLangSegmented();
    buildModelPills();
    bindControls();
    updateModeUI();
    render();

    ui.meta.textContent = `${DATA.models.length} models  ·  ${DATA.prompts.length} prompts  ·  ${Object.keys(DATA.completions).length.toLocaleString()} completions`;
}

function buildLangSegmented() {
    ui.lang.innerHTML = "";
    for (const code of Object.keys(promptsByLang)) {
        const btn = document.createElement("button");
        btn.className = "seg-btn";
        if (code === state.lang) btn.classList.add("active");
        btn.dataset.value = code;
        btn.innerHTML = `${LANG_FLAG[code] || ""} ${LANG_LABEL[code] || code} <span style="opacity:0.6;font-weight:400">· ${promptsByLang[code].length}</span>`;
        btn.addEventListener("click", () => {
            state.lang = code;
            state.promptIdx = 0;
            for (const b of ui.lang.children) b.classList.toggle("active", b.dataset.value === code);
            render();
        });
        ui.lang.appendChild(btn);
    }
}

function buildModelPills() {
    ui.modelPills.innerHTML = "";
    for (const g of GROUP_ORDER) {
        if (!modelsByGroup[g]) continue;
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "pill";
        if (state.selectedGroups.has(g)) pill.classList.add("active");
        pill.dataset.group = g;
        pill.innerHTML = `<span class="pill-dot group-${g}"></span>${GROUP_LABEL[g]}`;
        pill.title = GROUP_TITLE[g];
        pill.addEventListener("click", () => togglePill(g, pill));
        ui.modelPills.appendChild(pill);
    }
}

function togglePill(group, pill) {
    if (state.mode === "progression") {
        // single-select: only one group active
        state.selectedGroups.clear();
        state.selectedGroups.add(group);
        for (const p of ui.modelPills.children) {
            p.classList.toggle("active", p.dataset.group === group);
        }
    } else {
        // multi-select
        if (state.selectedGroups.has(group)) {
            state.selectedGroups.delete(group);
            pill.classList.remove("active");
        } else {
            state.selectedGroups.add(group);
            pill.classList.add("active");
        }
    }
    render();
}

function bindControls() {
    for (const b of ui.mode.querySelectorAll(".seg-btn")) {
        b.addEventListener("click", () => {
            state.mode = b.dataset.value;
            for (const x of ui.mode.querySelectorAll(".seg-btn")) {
                x.classList.toggle("active", x === b);
            }
            updateModeUI();
            render();
        });
    }

    ui.prev.addEventListener("click", () => moveByPrompt(-1));
    ui.next.addEventListener("click", () => moveByPrompt(+1));
    ui.jump.addEventListener("change", () => {
        const v = parseInt(ui.jump.value, 10);
        if (!isNaN(v)) jumpToPrompt(v - 1);
    });
    ui.randomBtn.addEventListener("click", () => {
        const arr = promptsByLang[state.lang] || [];
        if (arr.length) jumpToPrompt(Math.floor(Math.random() * arr.length));
    });
    ui.browseBtn.addEventListener("click", openBrowse);
    ui.browseClose.addEventListener("click", closeBrowse);
    ui.browseSearch.addEventListener("input", renderBrowseList);

    document.addEventListener("keydown", (e) => {
        if (e.target.matches("input, select, textarea")) return;
        if (e.key === "ArrowLeft") moveByPrompt(-1);
        if (e.key === "ArrowRight") moveByPrompt(+1);
        if (e.key === "Escape" && !ui.browseDrawer.hidden) closeBrowse();
    });
}

function updateModeUI() {
    if (state.mode === "progression") {
        // ensure exactly one group is selected
        if (state.selectedGroups.size !== 1) {
            const first = [...state.selectedGroups][0] || "A-75en";
            state.selectedGroups.clear();
            state.selectedGroups.add(first);
            for (const p of ui.modelPills.children) {
                p.classList.toggle("active", p.dataset.group === first);
            }
        }
        ui.modelsHint.textContent = "select one model — its checkpoints will appear side by side";
    } else {
        ui.modelsHint.textContent = "toggle models to compare; use the slider in each card to scrub through training";
    }
}

function moveByPrompt(delta) {
    const arr = promptsByLang[state.lang] || [];
    if (!arr.length) return;
    state.promptIdx = Math.max(0, Math.min(arr.length - 1, state.promptIdx + delta));
    render();
}

function jumpToPrompt(idx) {
    const arr = promptsByLang[state.lang] || [];
    if (!arr.length) return;
    state.promptIdx = Math.max(0, Math.min(arr.length - 1, idx));
    render();
}

function currentPrompt() {
    const arr = promptsByLang[state.lang] || [];
    return arr[state.promptIdx];
}

function getCompletion(modelId, prompt) {
    return DATA.completions[`${modelId}::${prompt.lang}::${prompt.idx}`];
}

function render() {
    const arr = promptsByLang[state.lang] || [];
    const prompt = currentPrompt();

    ui.counter.textContent = arr.length ? `#${state.promptIdx + 1} of ${arr.length}` : "—";
    ui.jump.max = arr.length;
    ui.jump.value = "";
    ui.prev.disabled = state.promptIdx <= 0;
    ui.next.disabled = state.promptIdx >= arr.length - 1;

    if (!prompt) {
        ui.promptText.textContent = "(no prompts available)";
        ui.promptMeta.textContent = "";
        ui.results.innerHTML = "";
        return;
    }

    ui.promptText.textContent = prompt.prompt;
    ui.promptMeta.textContent = `${LANG_LABEL[prompt.lang]} · ${prompt.prompt.length} chars · qid ${(prompt.source_question_id || "").slice(0, 8)}`;

    if (state.mode === "compare") renderCompare(prompt);
    else renderProgression(prompt);

    if (!ui.browseDrawer.hidden) renderBrowseList();
}

function renderCompare(prompt) {
    ui.results.innerHTML = "";
    const groups = GROUP_ORDER.filter((g) => state.selectedGroups.has(g) && modelsByGroup[g]);
    if (!groups.length) {
        ui.results.innerHTML = `<div class="empty-state">Select at least one model above to compare.</div>`;
        return;
    }
    const grid = document.createElement("div");
    grid.className = "cards-grid";
    for (const g of groups) grid.appendChild(buildCompareCard(g, prompt));
    ui.results.appendChild(grid);
}

function buildCompareCard(group, prompt) {
    const models = modelsByGroup[group];
    if (!state.cardSteps[group] || !models.find((m) => m.id === state.cardSteps[group])) {
        state.cardSteps[group] = models[models.length - 1].id;
    }
    const card = document.createElement("div");
    card.className = "card";

    const header = document.createElement("div");
    header.className = "card-header";
    const titleWrap = document.createElement("div");
    titleWrap.className = "card-title-wrap";
    const dot = document.createElement("span");
    dot.className = `card-dot group-${group}`;
    dot.style.background = getComputedStyle(document.documentElement).getPropertyValue(`--${group === "A-75en" ? "a75" : group === "A-25en" ? "a25" : group === "base" ? "base" : "sft-baseline"}-color`);
    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = GROUP_LABEL[group];
    title.title = GROUP_TITLE[group];
    titleWrap.appendChild(dot);
    titleWrap.appendChild(title);
    header.appendChild(titleWrap);

    const stepTag = document.createElement("span");
    stepTag.className = "card-step-tag";
    header.appendChild(stepTag);

    card.appendChild(header);

    const completion = document.createElement("div");
    completion.className = "completion";

    const setCkpt = (i) => {
        const m = models[i];
        state.cardSteps[group] = m.id;
        stepTag.textContent = m.step !== null ? `step ${m.step}` : "—";
        renderCompletion(completion, getCompletion(m.id, prompt));
    };

    if (models.length > 1) {
        const slider = document.createElement("div");
        slider.className = "step-slider";
        const range = document.createElement("input");
        range.type = "range";
        range.min = "0";
        range.max = String(models.length - 1);
        const idx = models.findIndex((m) => m.id === state.cardSteps[group]);
        range.value = String(idx >= 0 ? idx : models.length - 1);
        const stepLabel = document.createElement("span");
        stepLabel.className = "step-label";
        const updateLabel = (i) => {
            const m = models[i];
            stepLabel.textContent = m.step !== null ? `step ${m.step}` : "—";
        };
        updateLabel(parseInt(range.value, 10));
        range.addEventListener("input", () => {
            const i = parseInt(range.value, 10);
            updateLabel(i);
            setCkpt(i);
        });
        slider.appendChild(range);
        slider.appendChild(stepLabel);
        card.appendChild(slider);
        setCkpt(parseInt(range.value, 10));
    } else {
        setCkpt(0);
    }

    card.appendChild(completion);
    return card;
}

function renderProgression(prompt) {
    ui.results.innerHTML = "";
    const groups = GROUP_ORDER.filter((g) => state.selectedGroups.has(g) && modelsByGroup[g]);
    if (!groups.length) {
        ui.results.innerHTML = `<div class="empty-state">Select one model above to see its checkpoint progression.</div>`;
        return;
    }
    for (const g of groups) ui.results.appendChild(buildProgressionGroup(g, prompt));
}

function buildProgressionGroup(group, prompt) {
    const models = modelsByGroup[group];
    const wrap = document.createElement("div");
    wrap.className = "progression-group";

    const header = document.createElement("div");
    header.className = "progression-header";
    const dot = document.createElement("span");
    dot.className = `card-dot group-${group}`;
    dot.style.background = getComputedStyle(document.documentElement).getPropertyValue(`--${group === "A-75en" ? "a75" : group === "A-25en" ? "a25" : group === "base" ? "base" : "sft-baseline"}-color`);
    const title = document.createElement("span");
    title.className = "progression-title";
    title.textContent = GROUP_TITLE[group];
    const sub = document.createElement("span");
    sub.className = "progression-sub";
    sub.textContent = `${models.length} checkpoint${models.length === 1 ? "" : "s"}`;
    header.appendChild(dot);
    header.appendChild(title);
    header.appendChild(sub);
    wrap.appendChild(header);

    const strip = document.createElement("div");
    strip.className = "progression-strip";
    for (const m of models) {
        const card = document.createElement("div");
        card.className = "card";

        const ch = document.createElement("div");
        ch.className = "card-header";
        const tw = document.createElement("div");
        tw.className = "card-title-wrap";
        const ct = document.createElement("div");
        ct.className = "card-title";
        ct.textContent = m.label;
        tw.appendChild(ct);
        ch.appendChild(tw);
        const tag = document.createElement("span");
        tag.className = "card-step-tag";
        tag.textContent = m.step !== null ? `step ${m.step}` : "no SFT";
        ch.appendChild(tag);
        card.appendChild(ch);

        const completion = document.createElement("div");
        completion.className = "completion";
        renderCompletion(completion, getCompletion(m.id, prompt));
        card.appendChild(completion);

        strip.appendChild(card);
    }
    wrap.appendChild(strip);
    return wrap;
}

function renderCompletion(node, text) {
    if (text === undefined) {
        node.classList.add("empty");
        node.textContent = "(not generated yet)";
    } else {
        node.classList.remove("empty");
        node.textContent = text;
    }
}

/* ---------- browse drawer ---------- */

function openBrowse() {
    ui.browseDrawer.hidden = false;
    ui.browseSearch.value = "";
    renderBrowseList();
    setTimeout(() => ui.browseSearch.focus(), 30);
}

function closeBrowse() {
    ui.browseDrawer.hidden = true;
}

function renderBrowseList() {
    const arr = promptsByLang[state.lang] || [];
    const q = (ui.browseSearch.value || "").toLowerCase().trim();
    const filtered = q ? arr.filter((p) => p.prompt.toLowerCase().includes(q)) : arr;
    ui.browseList.innerHTML = "";
    filtered.forEach((p) => {
        const li = document.createElement("li");
        li.className = "browse-item";
        if (arr.indexOf(p) === state.promptIdx) li.classList.add("active");
        const num = document.createElement("span");
        num.className = "browse-item-num";
        num.textContent = `#${arr.indexOf(p) + 1}`;
        const txt = document.createElement("span");
        txt.className = "browse-item-text";
        txt.textContent = p.prompt;
        li.appendChild(num);
        li.appendChild(txt);
        li.addEventListener("click", () => {
            jumpToPrompt(arr.indexOf(p));
            closeBrowse();
        });
        ui.browseList.appendChild(li);
    });
    if (!filtered.length) {
        const li = document.createElement("li");
        li.className = "browse-item";
        li.style.color = "var(--text-soft)";
        li.textContent = "no prompts match";
        ui.browseList.appendChild(li);
    }
}

load().catch((err) => {
    ui.meta.textContent = `Error loading completions.json: ${err}`;
    console.error(err);
});
