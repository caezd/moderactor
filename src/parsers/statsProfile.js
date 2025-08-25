import { getDirectText, toKey, nextSiblingMatching } from "../core/utils";

/**
 * root
 * probe
 * dt pour  label
 * dd pour content (ou nextElementSibling si null/empty)
 */
const defaultCandidates = [
    {
        probe: { type: "selector", sel: "#profile-tab-field-profil dl" },
        dt: "dt span",
        dd: ".field_uneditable", // => dt.nextElementSibling
    },
];

function whenEmpty(s) {
    return s === "-" ? "" : s;
}

function pickCandidate(doc, candidates = []) {
    for (const c of candidates) {
        if (c.probe?.type === "selector") {
            const roots = doc.querySelectorAll(c.root || c.probe.sel);
            if (roots.length) return { cfg: c, roots: Array.from(roots) };
        }
    }
    return null;
}

function* iterEntriesForRoot(rootEl, c) {
    // MODE A: map de champs (plusieurs)
    if (typeof c.field === "string") {
        const key = toKey(c.field);
        const value = rootEl.innerHTML.trim(); // ou rootEl.textContent.trim()
        yield { key, valueEl: { textContent: value } }; // petit hack : on passe un faux "el"
        return;
    }

    // MODE B: dt/dd classique
    const dtSel = c.dt || "dt";
    const ddSel = c.dd ?? null;
    const dts = rootEl.querySelectorAll(dtSel);

    for (const dt of dts) {
        let valueEl = null;
        if (ddSel) {
            valueEl =
                nextSiblingMatching(dt, ddSel) || rootEl.querySelector(ddSel);
        } else {
            valueEl = dt.nextElementSibling;
        }
        const key = toKey(getDirectText(dt));
        if (key) yield { key, valueEl };
    }
}

function readUserFields(doc, candidates) {
    const choice = pickCandidate(doc, candidates);
    if (!choice) return {};

    const { cfg, roots } = choice;
    const out = {};

    for (const rootEl of roots) {
        for (const { key, valueEl } of iterEntriesForRoot(rootEl, cfg)) {
            const value =
                valueEl && "textContent" in valueEl
                    ? whenEmpty(valueEl.textContent.trim())
                    : "";
            if (!(key in out)) out[key] = value;
            else if (value && !out[key].includes(value))
                out[key] = `${out[key]}, ${value}`;
        }
    }
    return out;
}

export function parseProfileStats(doc, { candidates } = {}) {
    const merged = Array.isArray(candidates)
        ? [...candidates, ...defaultCandidates]
        : defaultCandidates;
    return readUserFields(doc, merged);
}
