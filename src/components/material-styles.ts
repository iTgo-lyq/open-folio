import styles from "./change-materials.module.css";
export const materialClass = (names: string) =>
  names
    .split(/\s+/)
    .map((name) => styles[name])
    .filter(Boolean)
    .join(" ");
export const sectionId = (title: string) => title.trim().replace(/\s+/g, "-");
