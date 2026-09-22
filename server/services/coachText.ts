// Text normalization shared by the Coach router modules: lowercase, accent-free,
// apostrophes dropped, "3-4" -> "3 to 4", everything else non-alphanumeric -> space.
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/(\d)\s*[-–—]\s*(\d)/g, "$1 to $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
