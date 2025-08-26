function encodeForm(data) {
    const form_data = new FormData();
    for (const key in data) {
        const val = data[key];
        if (Array.isArray(val)) {
            const k = key.endsWith("[]") ? key : key + "[]";
            for (const v of val) form_data.append(k, v);
        } else {
            form_data.append(key, val);
        }
    }
    return [...form_data.entries()]
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
}

export function htmlFromText(text) {
    const parser = new DOMParser();
    return parser.parseFromString(text, "text/html");
}

export async function httpGet(url) {
    const r = await fetch(url, { credentials: "same-origin" });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text, doc: htmlFromText(text) };
}

export async function httpPost(url, data) {
    const body = encodeForm(data);
    console.log("[httpPost] body:", body);
    const r = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body,
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text, doc: htmlFromText(text) };
}
