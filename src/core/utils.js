export const isArray = Array.isArray;

export const toArray = (v) => (v == null ? [] : isArray(v) ? v : [v]);

export function byIdOrArray(input) {
    return toArray(input)
        .filter((x) => x != null)
        .map((x) => (typeof x === "number" ? x : parseInt(String(x), 10)))
        .filter((x) => Number.isFinite(x) && x > 0);
}
