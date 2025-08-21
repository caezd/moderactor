function encodeForm(data) {
    var form_data = new FormData();

    for (var key in data) {
        form_data.append(key, data[key]);
    }
    return [...form_data.entries()]
        .map((x) => `${encodeURIComponent(x[0])}=${encodeURIComponent(x[1])}`)
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
