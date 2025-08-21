export const isArray = Array.isArray;

export const toArray = (v) => (v == null ? [] : isArray(v) ? v : [v]);

export function byIdOrArray(input) {
    return toArray(input)
        .filter((x) => x != null)
        .map((x) => (typeof x === "number" ? x : parseInt(String(x), 10)))
        .filter((x) => Number.isFinite(x) && x > 0);
}

export function getCookie(cname) {
    let name = cname + "=";
    let decodedCookie = decodeURIComponent(document.cookie);
    let ca = decodedCookie.split(";");
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == " ") {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}
