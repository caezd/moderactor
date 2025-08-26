import { getDirectText, toKey, nextSiblingMatching } from "../core/utils";

/**
 * root
 * probe
 * dt pour  label
 * dd pour content (ou nextElementSibling si null/empty)
 */
const defaultCandidates = [
    /** PHPBB2 ADVANCED */
    {
        probe: { type: "selector", sel: "#profile-advanced-details dl" },
        dt: "dt span",
        dd: ".field_uneditable",
    },
    /** PHPBB3 & MODERNBB & AWESOMEBB ADVANCED */
    {
        probe: { type: "selector", sel: "#profile-tab-field-profil dl" },
        dt: "dt span",
        dd: ".field_uneditable",
    },
    { probe: { type: "selector", sel: ".mod-login-avatar" }, field: "avatar" },

    /** PunBB & INVISION ADVANCED */
    {
        probe: { type: "selector", sel: "#profile-advanced-details dl" },
        dt: "dt span",
        dd: ".field_uneditable", // => dt.nextElementSibling
    },

    {
        probe: { type: "selector", sel: "h1" },
        field: "username",
        extract: {
            mode: "text",
            remove: [/^Tout à propos de\s*/i],
            normalizeWhitespace: true,
        },
    },
];

function whenEmpty(s) {
    return s === "-" ? "" : s;
}

function pickCandidates(doc, candidates = []) {
    const matches = [];
    for (const c of candidates) {
        if (c.probe?.type === "selector" && typeof c.probe.sel === "string") {
            const roots = doc.querySelectorAll(c.probe.sel);
            if (roots.length) {
                matches.push({ cfg: c, roots: Array.from(roots) });
            }
        }
    }
    return matches;
}

function extractValue(rootEl, c) {
    const ex = c.extract;

    // 1) extract peut être une fonction personnalisée
    if (typeof ex === "function") {
        return ex(rootEl) ?? "";
    }

    // 2) extract peut être une chaîne courte : "text" | "innerHTML" | "outerHTML" | "attr:NAME"
    if (typeof ex === "string") {
        if (ex === "text") return rootEl.textContent?.trim() ?? "";
        if (ex === "innerHTML") return rootEl.innerHTML?.trim() ?? "";
        if (ex === "outerHTML") return rootEl.outerHTML?.trim() ?? "";
        if (ex.startsWith("attr:")) {
            const attr = ex.slice("attr:".length);
            return (rootEl.getAttribute?.(attr) || "").trim();
        }
        // défaut: innerHTML
        return rootEl.innerHTML?.trim() ?? "";
    }

    // 3) extract peut être un objet riche
    if (ex && typeof ex === "object") {
        // Options supportées :
        // mode: "text" | "innerHTML" | "outerHTML" | "attr"
        // sel: sous-sélecteur optionnel
        // attr: nom d'attribut si mode === "attr"
        // match: RegExp OU string (on garde le 1er groupe si RegExp avec groupe, sinon le match complet)
        // remove: RegExp | string | Array<RegExp|string> à retirer
        // replace: Array<[RegExp|string, string]> (chaîne de remplacements)
        // normalizeWhitespace: boolean
        // trim: boolean (défaut: true)

        const {
            mode = "innerHTML",
            sel = null,
            attr = null,
            match = null,
            remove = null,
            replace = null,
            normalizeWhitespace = false,
            trim = true,
        } = ex;

        // cibler un sous-élément si demandé
        const el = sel ? rootEl.querySelector(sel) || rootEl : rootEl;

        let val = "";
        if (mode === "text") val = el.textContent ?? "";
        else if (mode === "outerHTML") val = el.outerHTML ?? "";
        else if (mode === "attr" && attr) val = el.getAttribute?.(attr) ?? "";
        else val = el.innerHTML ?? ""; // innerHTML par défaut

        // match : garder seulement une portion
        if (match) {
            if (match instanceof RegExp) {
                const m = val.match(match);
                if (m) val = m[1] ?? m[0];
                else val = "";
            } else if (typeof match === "string") {
                const idx = val.indexOf(match);
                val = idx >= 0 ? match : "";
            }
        }

        // remove : retirer motifs
        const applyRemove = (v, pat) =>
            pat instanceof RegExp ? v.replace(pat, "") : v.split(pat).join("");
        if (remove) {
            if (Array.isArray(remove)) {
                for (const pat of remove) val = applyRemove(val, pat);
            } else {
                val = applyRemove(val, remove);
            }
        }

        // replace : liste de [pattern, repl]
        if (Array.isArray(replace)) {
            for (const [pat, repl] of replace) {
                if (pat instanceof RegExp) val = val.replace(pat, repl);
                else val = val.split(pat).join(repl);
            }
        }

        if (normalizeWhitespace) {
            val = val.replace(/\s+/g, " ");
        }
        if (trim) {
            val = val.trim();
        }
        return val;
    }

    // 4) défaut si extract non fourni : innerHTML
    return rootEl.innerHTML?.trim() ?? "";
}

function* iterEntriesForRoot(rootEl, c) {
    // MODE A: champ unique via 'field' (ex: avatar) -> on remonte innerHTML
    if (typeof c.field === "string") {
        const key = toKey(c.field);
        const value = extractValue(rootEl, c);
        yield { key, valueEl: { textContent: value } };
        return;
    }

    // MODE B: dt/dd classique (plusieurs paires)
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
    // On veut tous les matchs, pas juste le premier
    const choices = pickCandidates(doc, candidates);
    if (!choices.length) return {};

    const out = {};

    for (const { cfg, roots } of choices) {
        for (const rootEl of roots) {
            for (const { key, valueEl } of iterEntriesForRoot(rootEl, cfg)) {
                const value =
                    valueEl && "textContent" in valueEl
                        ? whenEmpty(valueEl.textContent.trim())
                        : "";

                if (!(key in out)) {
                    out[key] = value;
                } else if (value && !out[key].includes(value)) {
                    out[key] = `${out[key]}, ${value}`;
                }
            }
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
