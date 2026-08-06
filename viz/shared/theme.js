"use strict";
window.VIZ = window.VIZ || {};

// 明暗の切り替えと、canvas から使うための CSS 変数の読み出し。
// タブで行き来しても配色が戻らないよう、選択はページをまたいで持ち越す。
VIZ.theme = (() => {
  const KEY = "viz-theme";
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const listeners = [];

  // file:// では localStorage が使えない環境がある。読めなければ OS 設定に従うだけで、
  // 動作そのものは壊さない。
  function stored() {
    try { return window.localStorage.getItem(KEY); } catch (error) { return null; }
  }

  function store(value) {
    try { window.localStorage.setItem(KEY, value); } catch (error) { /* 持ち越さない */ }
  }

  function isDark() {
    const chosen = document.documentElement.dataset.theme;
    if (chosen === "dark") return true;
    if (chosen === "light") return false;
    return query.matches;
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  function toggle() {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store(next);
    notify();
  }

  function onChange(listener) {
    listeners.push(listener);
  }

  // canvas と SVG は CSS 変数を直接引けないので、そのつど実際の値を読み出す。
  // 3ページで使う色をまとめて返す。使わない項目があっても構わない。
  function read() {
    const style = getComputedStyle(document.documentElement);
    const get = (name) => style.getPropertyValue(name).trim();
    return {
      dark: isDark(),
      surface: get("--surface-1"),
      plane: get("--plane"),
      text: get("--text-primary"),
      secondary: get("--text-secondary"),
      muted: get("--muted"),
      grid: get("--gridline"),
      axis: get("--axis"),
      accent: get("--accent"),
      diagonal: get("--diagonal"),
      poleIn: get("--pole-in"),
      poleOut: get("--pole-out"),
      poleMid: get("--pole-mid"),
    };
  }

  function channels(hex) {
    const value = parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }

  function blend(a, b, t) {
    const ca = channels(a);
    const cb = channels(b);
    return `#${ca.map((value, index) => Math.round(value + (cb[index] - value) * t)
      .toString(16).padStart(2, "0")).join("")}`;
  }

  function withAlpha(hex, alpha) {
    const [r, g, b] = channels(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // 保存されている選択を、本文が描かれる前に当てる。
  const chosen = stored();
  if (chosen === "dark" || chosen === "light") document.documentElement.dataset.theme = chosen;

  query.addEventListener("change", notify);

  return { isDark, toggle, onChange, read, channels, blend, withAlpha };
})();
