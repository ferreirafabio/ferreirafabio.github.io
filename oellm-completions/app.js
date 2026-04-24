const LANG_LABEL = { fr: "French", de: "German", fi: "Finnish" };

const GROUP_ORDER = ["base", "sft-baseline", "A-75en", "A-25en"];
const GROUP_LABEL = {
    base: "Pre-SFT base",
    "sft-baseline": "SFT baseline (no multilingual)",
    "A-75en": "A-75en (75% en, 25% translated)",
    "A-25en": "A-25en (25% en, 75% translated)",
};

let DATA = null;
let modelsByGroup = {};
let promptsByLang = {};

const ui = {
    lang: document.getElementById("lang"),
    prompt: document.getElementById("prompt"),
    mode: document.getElementById("mode"),
    group: document.getElementById("group"),
    groupControl: document.getElementById("group-control"),
    groupsControl: document.getElementById("groups-control"),
    groupsCheckboxes: document.getElementById("groups-checkboxes"),
    promptText: document.getElementById("prompt-text"),
    results: document.getElementById("results"),
    meta: document.getElementById("meta"),
};

const state = {
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
    }

    promptsByLang = {};
    for (const p of DATA.prompts) {
        (promptsByLang[p.lang] ||= []).push(p);
    }

    populateLangs();
    populateGroupsCheckboxes();
    populateGroupSelect();
    onLangChange();

    ui.meta.textContent = `${DATA.models.length} models · ${DATA.prompts.length} prompts · ${Object.keys(DATA.completions).length} completions`;
}

function populateLangs() {
    ui.lang.innerHTML = "";
    for (const code of Object.keys(promptsByLang)) {
        const opt = document.createElement("option");
        opt.value = code;
        opt.textContent = `${LANG_LABEL[code] || code} (${promptsByLang[code].length})`;
        ui.lang.appendChild(opt);
    }
}

function populateGroupsCheckboxes() {
    ui.groupsCheckboxes.innerHTML = "";
    for (const g of GROUP_ORDER) {
        if (!modelsByGroup[g]) continue;
        const id = `cb-${g}`;
        const label = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.id = id;
        cb.value = g;
        cb.checked = state.selectedGroups.has(g);
        cb.addEventListener("change", () => {
            if (cb.checked) state.selectedGroups.add(g);
            else state.selectedGroups.delete(g);
            render();
        });
        const tag = document.createElement("span");
        tag.className = `group-tag group-${g}`;
        tag.textContent = g;
        label.appendChild(cb);
        label.appendChild(tag);
        const txt = document.createTextNode(" " + GROUP_LABEL[g]);
        label.appendChild(txt);
        ui.groupsCheckboxes.appendChild(label);
    }
}

function populateGroupSelect() {
    ui.group.innerHTML = "";
    for (const g of GROUP_ORDER) {
        if (!modelsByGroup[g]) continue;
        const opt = document.createElement("option");
        opt.value = g;
        opt.textContent = GROUP_LABEL[g];
        ui.group.appendChild(opt);
    }
}

function onLangChange() {
    const lang = ui.lang.value;
    const prompts = promptsByLang[lang] || [];
    ui.prompt.innerHTML = "";
    prompts.forEach((p, i) => {
        const opt = document.createElement("option");
        opt.value = p.idx;
        const preview = (p.prompt || "").replace(/\s+/g, " ").slice(0, 80);
        opt.textContent = `[${i + 1}] ${preview}`;
        ui.prompt.appendChild(opt);
    });
    render();
}

function currentPrompt() {
    const lang = ui.lang.value;
    const idx = parseInt(ui.prompt.value, 10);
    return (promptsByLang[lang] || []).find((p) => p.idx === idx);
}

function getCompletion(modelId, prompt) {
    const key = `${modelId}::${prompt.lang}::${prompt.idx}`;
    return DATA.completions[key];
}

function render() {
    const mode = ui.mode.value;
    if (mode === "compare") {
        ui.groupControl.hidden = true;
        ui.groupsControl.hidden = false;
    } else {
        ui.groupControl.hidden = false;
        ui.groupsControl.hidden = true;
    }

    const prompt = currentPrompt();
    if (!prompt) {
        ui.promptText.textContent = "(no prompts available)";
        ui.results.innerHTML = "";
        return;
    }
    ui.promptText.textContent = prompt.prompt;

    if (mode === "compare") renderCompare(prompt);
    else renderProgression(prompt);
}

function renderCompare(prompt) {
    ui.results.innerHTML = "";
    const cards = document.createElement("div");
    cards.className = "cards";
    for (const g of GROUP_ORDER) {
        if (!state.selectedGroups.has(g)) continue;
        if (!modelsByGroup[g]) continue;
        cards.appendChild(buildCompareCard(g, prompt));
    }
    ui.results.appendChild(cards);
}

function buildCompareCard(group, prompt) {
    const models = modelsByGroup[group];
    if (!state.cardSteps[group]) {
        const last = models[models.length - 1];
        state.cardSteps[group] = last.id;
    }
    const card = document.createElement("div");
    card.className = "card";

    const header = document.createElement("div");
    header.className = "card-header";
    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = GROUP_LABEL[group];
    const tag = document.createElement("span");
    tag.className = `group-tag group-${group}`;
    tag.textContent = group;
    header.appendChild(title);
    header.appendChild(tag);
    card.appendChild(header);

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
            state.cardSteps[group] = models[i].id;
            const completionDiv = card.querySelector(".completion");
            const m = models[i];
            const text = getCompletion(m.id, prompt);
            renderCompletion(completionDiv, text);
        });
        slider.appendChild(range);
        slider.appendChild(stepLabel);
        card.appendChild(slider);
    }

    const completion = document.createElement("div");
    completion.className = "completion";
    const m = models.find((mm) => mm.id === state.cardSteps[group]) || models[models.length - 1];
    renderCompletion(completion, getCompletion(m.id, prompt));
    card.appendChild(completion);

    return card;
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

function renderProgression(prompt) {
    ui.results.innerHTML = "";
    const group = ui.group.value;
    const models = modelsByGroup[group] || [];
    const list = document.createElement("div");
    list.className = "progression-list";
    for (const m of models) {
        const card = document.createElement("div");
        card.className = "card";
        const header = document.createElement("div");
        header.className = "card-header";
        const title = document.createElement("div");
        title.className = "card-title";
        title.textContent = m.label;
        const tag = document.createElement("span");
        tag.className = `group-tag group-${group}`;
        tag.textContent = m.step !== null ? `step ${m.step}` : group;
        header.appendChild(title);
        header.appendChild(tag);
        card.appendChild(header);
        const completion = document.createElement("div");
        completion.className = "completion";
        renderCompletion(completion, getCompletion(m.id, prompt));
        card.appendChild(completion);
        list.appendChild(card);
    }
    ui.results.appendChild(list);
}

ui.lang.addEventListener("change", onLangChange);
ui.prompt.addEventListener("change", render);
ui.mode.addEventListener("change", render);
ui.group.addEventListener("change", render);

load().catch((err) => {
    ui.meta.textContent = `Error loading completions.json: ${err}`;
    console.error(err);
});
