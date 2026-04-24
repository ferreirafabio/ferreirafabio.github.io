const LANG_LABEL = { fr: "French", de: "German", fi: "Finnish", sv: "Swedish", it: "Italian", es: "Spanish", cs: "Czech" };
const LANG_FLAG = { fr: "🇫🇷", de: "🇩🇪", fi: "🇫🇮", sv: "🇸🇪", it: "🇮🇹", es: "🇪🇸", cs: "🇨🇿" };

const CATEGORY_LABEL = {
    math: "Math",
    if: "Instr-following",
    creativity: "Creativity",
    complexity: "Complexity",
    problem_solving: "Problem-solving",
    technical_accuracy: "Technical",
    specificity: "Specificity",
    real_world: "Real-world",
    domain_knowledge: "Domain knowledge",
};

// A-25en temporarily hidden — matched-compute re-run is in progress (job 28807734).
// Original A-25en used 4.62M samples vs A-75en's 2.87M, so the comparison
// conflated ratio with compute. Card returns once dt-A-25en-matched is trained
// and its completions are generated.
const GROUP_ORDER = ["base", "sft-baseline", "A-75en"];
const GROUP_LABEL = {
    base: "Pre-SFT (base)",
    "sft-baseline": "OLMo-3-7B-Instruct-SFT",
    "A-75en": "A-75en",
    "A-25en": "A-25en",
};
const GROUP_TITLE = {
    base: "OLMo-3-1025-7B (no SFT) — allenai/Olmo-3-1025-7B",
    "sft-baseline": "Our reproduction of allenai/Olmo-3-7B-Instruct-SFT, v2 (trained on Dolci-Instruct-SFT, English-only) at step 3252",
    "A-75en": "Dolci-Translated A-75en (75% en, 25% translated, continued SFT from v2)",
    "A-25en": "Dolci-Translated A-25en (25% en, 75% translated, continued SFT from v2)",
};

const TICK_COUNT = 5;

let DATA = null;
let modelsByGroup = {};
let promptsByLang = {};

const ui = {
    lang: document.getElementById("lang-segmented"),
    modelToggles: document.getElementById("model-toggles"),
    categoryPills: document.getElementById("category-pills"),
    categoryClear: document.getElementById("category-clear"),
    counter: document.getElementById("prompt-counter"),
    prev: document.getElementById("prev-prompt"),
    next: document.getElementById("next-prompt"),
    jump: document.getElementById("prompt-jump"),
    randomBtn: document.getElementById("random-prompt"),
    listBtn: document.getElementById("list-toggle"),
    listClose: document.getElementById("list-close"),
    listModal: document.getElementById("list-modal"),
    listBackdrop: document.getElementById("list-backdrop"),
    listTitle: document.getElementById("list-title"),
    promptList: document.getElementById("prompt-list"),
    stepSlider: document.getElementById("step-slider"),
    stepCounter: document.getElementById("step-counter"),
    promptText: document.getElementById("prompt-text"),
    promptMeta: document.getElementById("prompt-display-meta"),
    results: document.getElementById("results"),
    meta: document.getElementById("meta"),
};

const state = {
    lang: null,
    promptIdx: 0,
    stepIdx: TICK_COUNT - 1,  // default to final
    visibleGroups: new Set(GROUP_ORDER),
    activeCategories: new Set(),  // empty = no filter (show all)
};

async function load() {
    const resp = await fetch("completions.json");
    DATA = await resp.json();

    modelsByGroup = {};
    for (const m of DATA.models) (modelsByGroup[m.group] ||= []).push(m);
    for (const g of Object.keys(modelsByGroup)) {
        modelsByGroup[g].sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
    }

    promptsByLang = {};
    for (const p of DATA.prompts) (promptsByLang[p.lang] ||= []).push(p);
    for (const lang of Object.keys(promptsByLang)) {
        promptsByLang[lang].sort((a, b) => a.idx - b.idx);
    }

    state.lang = Object.keys(promptsByLang)[0];

    buildLangSegmented();
    buildModelToggles();
    buildCategoryPills();
    bindControls();
    render();

    ui.meta.textContent = `${DATA.models.length} checkpoints  ·  ${DATA.prompts.length} prompts  ·  ${Object.keys(DATA.completions).length.toLocaleString()} completions`;
}

function buildLangSegmented() {
    ui.lang.innerHTML = "";
    for (const code of Object.keys(promptsByLang)) {
        const btn = document.createElement("button");
        btn.className = "seg-btn";
        if (code === state.lang) btn.classList.add("active");
        btn.dataset.value = code;
        btn.innerHTML = `${LANG_FLAG[code] || ""} ${LANG_LABEL[code] || code} <span class="seg-count">${promptsByLang[code].length}</span>`;
        btn.addEventListener("click", () => {
            state.lang = code;
            state.promptIdx = 0;
            for (const b of ui.lang.children) b.classList.toggle("active", b.dataset.value === code);
            render();
        });
        ui.lang.appendChild(btn);
    }
}

function buildModelToggles() {
    ui.modelToggles.innerHTML = "";
    for (const g of GROUP_ORDER) {
        if (!modelsByGroup[g]) continue;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pill";
        btn.dataset.group = g;
        if (state.visibleGroups.has(g)) btn.classList.add("active");
        btn.title = GROUP_TITLE[g];
        btn.innerHTML = `
            <span class="pill-check" aria-hidden="true">${state.visibleGroups.has(g) ? "✓" : ""}</span>
            <span class="pill-dot group-dot-${g}"></span>
            ${GROUP_LABEL[g]}
        `;
        btn.addEventListener("click", () => {
            if (state.visibleGroups.has(g)) {
                state.visibleGroups.delete(g);
                btn.classList.remove("active");
            } else {
                state.visibleGroups.add(g);
                btn.classList.add("active");
            }
            const check = btn.querySelector(".pill-check");
            if (check) check.textContent = state.visibleGroups.has(g) ? "✓" : "";
            renderResults();
        });
        ui.modelToggles.appendChild(btn);
    }
}

function buildCategoryPills() {
    if (!ui.categoryPills) return;
    ui.categoryPills.innerHTML = "";
    const allCats = (DATA && DATA.categories) || Object.keys(CATEGORY_LABEL);
    for (const cat of allCats) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pill pill-cat";
        btn.dataset.cat = cat;
        btn.textContent = CATEGORY_LABEL[cat] || cat;
        btn.title = `Filter to prompts tagged ${cat}`;
        btn.addEventListener("click", () => {
            if (state.activeCategories.has(cat)) {
                state.activeCategories.delete(cat);
                btn.classList.remove("active");
            } else {
                state.activeCategories.add(cat);
                btn.classList.add("active");
            }
            state.promptIdx = 0;
            render();
        });
        ui.categoryPills.appendChild(btn);
    }
    if (ui.categoryClear) {
        ui.categoryClear.addEventListener("click", () => {
            state.activeCategories.clear();
            for (const b of ui.categoryPills.querySelectorAll(".pill-cat.active")) b.classList.remove("active");
            state.promptIdx = 0;
            render();
        });
    }
}

function filteredPrompts() {
    const arr = promptsByLang[state.lang] || [];
    if (state.activeCategories.size === 0) return arr;
    const wanted = state.activeCategories;
    return arr.filter((p) => {
        const pcats = p.categories || [];
        for (const c of wanted) if (pcats.includes(c)) return true;
        return false;
    });
}

function bindControls() {
    ui.prev.addEventListener("click", () => moveByPrompt(-1));
    ui.next.addEventListener("click", () => moveByPrompt(+1));
    ui.jump.addEventListener("change", () => {
        const v = parseInt(ui.jump.value, 10);
        if (!isNaN(v)) jumpToPrompt(v - 1);
    });
    ui.randomBtn.addEventListener("click", () => {
        const arr = filteredPrompts();
        if (arr.length) jumpToPrompt(Math.floor(Math.random() * arr.length));
    });
    ui.listBtn.addEventListener("click", openList);
    ui.listClose.addEventListener("click", closeList);
    ui.listBackdrop.addEventListener("click", closeList);

    ui.stepSlider.addEventListener("input", () => {
        state.stepIdx = parseInt(ui.stepSlider.value, 10);
        renderResults();
        renderStepCounter();
    });

    document.addEventListener("keydown", (e) => {
        if (e.target.matches("input, select, textarea")) return;
        if (e.key === "ArrowLeft") moveByPrompt(-1);
        if (e.key === "ArrowRight") moveByPrompt(+1);
        if (e.key === "Escape" && !ui.listModal.hidden) closeList();
    });
}

function moveByPrompt(delta) {
    const arr = filteredPrompts();
    if (!arr.length) return;
    state.promptIdx = Math.max(0, Math.min(arr.length - 1, state.promptIdx + delta));
    render();
}

function jumpToPrompt(idx) {
    const arr = filteredPrompts();
    if (!arr.length) return;
    state.promptIdx = Math.max(0, Math.min(arr.length - 1, idx));
    render();
}

function currentPrompt() {
    const arr = filteredPrompts();
    return arr[state.promptIdx];
}

function getCompletion(modelId, prompt) {
    return DATA.completions[`${modelId}::${prompt.lang}::${prompt.idx}`];
}

function modelForGroupAtStep(group, stepIdx) {
    const models = modelsByGroup[group] || [];
    if (!models.length) return null;
    if (models.length === 1) return models[0];
    // map global stepIdx (0..TICK_COUNT-1) into the group's ckpt index
    const i = Math.min(models.length - 1, Math.max(0, stepIdx));
    return models[i];
}

function render() {
    const arr = filteredPrompts();
    const total = (promptsByLang[state.lang] || []).length;
    const prompt = currentPrompt();

    if (state.activeCategories.size > 0) {
        ui.counter.textContent = arr.length ? `#${state.promptIdx + 1} of ${arr.length} (${state.activeCategories.size} cat filter, ${total} total)` : `0 of ${total} (filtered)`;
    } else {
        ui.counter.textContent = arr.length ? `#${state.promptIdx + 1} of ${arr.length}` : "—";
    }
    ui.jump.max = arr.length;
    ui.jump.value = "";
    ui.prev.disabled = state.promptIdx <= 0;
    ui.next.disabled = state.promptIdx >= arr.length - 1;

    if (!prompt) {
        ui.promptText.textContent = arr.length === 0 && state.activeCategories.size > 0
            ? "(no prompts in this language match the selected categories)"
            : "(no prompts available)";
        ui.promptMeta.textContent = "";
        ui.results.innerHTML = "";
        return;
    }

    ui.promptText.textContent = prompt.prompt;
    const catLabels = (prompt.categories || []).map((c) => CATEGORY_LABEL[c] || c);
    const catTxt = catLabels.length ? `  ·  ${catLabels.join(", ")}` : "";
    ui.promptMeta.textContent = `${LANG_LABEL[prompt.lang]} · ${prompt.prompt.length} chars · qid ${(prompt.source_question_id || "").slice(0, 8)}${catTxt}`;

    renderStepCounter();
    renderResults();

    if (!ui.listModal.hidden) renderPromptList();
}

function renderStepCounter() {
    const parts = [];
    for (const g of GROUP_ORDER) {
        const models = modelsByGroup[g] || [];
        if (models.length <= 1) continue;  // skip static groups
        const m = modelForGroupAtStep(g, state.stepIdx);
        const step = m && m.step !== null ? `step ${m.step}` : "—";
        parts.push(`${g} ${step}`);
    }
    ui.stepCounter.textContent = parts.join("  ·  ");
}

function renderResults() {
    const prompt = currentPrompt();
    if (!prompt) { ui.results.innerHTML = ""; return; }

    ui.results.innerHTML = "";
    const visible = GROUP_ORDER.filter((g) => modelsByGroup[g] && state.visibleGroups.has(g));
    if (!visible.length) {
        ui.results.innerHTML = `<div class="empty-state">All models hidden — toggle one back on above.</div>`;
        return;
    }

    // section header above the cards row
    const header = document.createElement("div");
    header.className = "completions-display-head";
    const tag = document.createElement("span");
    tag.className = "completions-display-tag";
    tag.textContent = "Completions";
    const meta = document.createElement("span");
    meta.className = "completions-display-meta";
    meta.textContent = `${visible.length} model${visible.length === 1 ? "" : "s"}  ·  training-progress slider ${state.stepIdx + 1}/${TICK_COUNT}`;
    header.appendChild(tag);
    header.appendChild(meta);
    ui.results.appendChild(header);

    const grid = document.createElement("div");
    grid.className = `cards-row cards-row-${visible.length}`;
    for (const group of visible) grid.appendChild(buildCard(group, prompt));
    ui.results.appendChild(grid);
}

function buildCard(group, prompt) {
    const m = modelForGroupAtStep(group, state.stepIdx);
    const isStatic = (modelsByGroup[group] || []).length === 1;
    const card = document.createElement("div");
    card.className = `card group-${group}`;

    const header = document.createElement("div");
    header.className = "card-header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "card-title-wrap";
    const dot = document.createElement("span");
    dot.className = `card-dot group-dot-${group}`;
    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = GROUP_LABEL[group];
    title.title = GROUP_TITLE[group];
    titleWrap.appendChild(dot);
    titleWrap.appendChild(title);
    header.appendChild(titleWrap);

    const stepTag = document.createElement("span");
    stepTag.className = "card-step-tag";
    if (isStatic) {
        stepTag.classList.add("static");
        stepTag.textContent = m.step !== null ? `step ${m.step} (static)` : "no SFT";
    } else {
        stepTag.textContent = `step ${m.step}`;
    }
    header.appendChild(stepTag);
    card.appendChild(header);

    const completion = document.createElement("div");
    completion.className = "completion";
    const text = getCompletion(m.id, prompt);
    if (text === undefined) {
        completion.classList.add("empty");
        completion.textContent = "(not generated yet)";
    } else {
        completion.textContent = text;
    }
    card.appendChild(completion);

    return card;
}

/* ---------- prompt list modal ---------- */

function openList() {
    ui.listModal.hidden = false;
    ui.listBackdrop.hidden = false;
    const arr = filteredPrompts();
    const total = (promptsByLang[state.lang] || []).length;
    const catNote = state.activeCategories.size > 0 ? `  ·  ${arr.length}/${total} matching ${state.activeCategories.size} cat filter` : `  ·  ${total} total`;
    ui.listTitle.textContent = `Prompts · ${LANG_LABEL[state.lang]}${catNote}`;
    renderPromptList();
}

function closeList() {
    ui.listModal.hidden = true;
    ui.listBackdrop.hidden = true;
}

function renderPromptList() {
    const arr = filteredPrompts();
    ui.promptList.innerHTML = "";
    arr.forEach((p, i) => {
        const li = document.createElement("li");
        li.className = "browse-item";
        if (i === state.promptIdx) li.classList.add("active");
        const num = document.createElement("span");
        num.className = "browse-item-num";
        num.textContent = `#${i + 1}`;
        const txt = document.createElement("span");
        txt.className = "browse-item-text";
        txt.textContent = p.prompt;
        // small category chips under the prompt text
        if (p.categories && p.categories.length) {
            const chips = document.createElement("div");
            chips.className = "browse-item-chips";
            for (const c of p.categories) {
                const chip = document.createElement("span");
                chip.className = "browse-chip";
                chip.textContent = CATEGORY_LABEL[c] || c;
                chips.appendChild(chip);
            }
            const wrap = document.createElement("div");
            wrap.className = "browse-item-text-wrap";
            wrap.appendChild(txt);
            wrap.appendChild(chips);
            li.appendChild(num);
            li.appendChild(wrap);
        } else {
            li.appendChild(num);
            li.appendChild(txt);
        }
        li.addEventListener("click", () => {
            jumpToPrompt(i);
            closeList();
        });
        ui.promptList.appendChild(li);
    });
    if (!arr.length) {
        const li = document.createElement("li");
        li.className = "browse-item";
        li.style.color = "var(--text-soft)";
        li.textContent = state.activeCategories.size > 0 ? "No prompts match the selected categories." : "No prompts in this language.";
        ui.promptList.appendChild(li);
    }
    const active = ui.promptList.querySelector(".browse-item.active");
    if (active) setTimeout(() => active.scrollIntoView({ block: "center", behavior: "auto" }), 30);
}

/* ---------- theme (light / dark) ---------- */

function initTheme() {
    const stored = localStorage.getItem("oellm-theme");
    let theme;
    if (stored === "dark" || stored === "light") {
        theme = stored;
    } else {
        theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    setTheme(theme, false);

    const toggle = document.getElementById("theme-toggle");
    if (toggle) {
        toggle.addEventListener("click", () => {
            const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
            setTheme(next, true);
        });
    }

    document.addEventListener("keydown", (e) => {
        if (e.target.matches("input, select, textarea")) return;
        if (e.key === "t" || e.key === "T") {
            const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
            setTheme(next, true);
        }
    });
}

function setTheme(theme, persist) {
    document.documentElement.setAttribute("data-theme", theme);
    const toggle = document.getElementById("theme-toggle");
    if (toggle) toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    if (persist) localStorage.setItem("oellm-theme", theme);
}

initTheme();

load().catch((err) => {
    ui.meta.textContent = `Error loading completions.json: ${err}`;
    console.error(err);
});
