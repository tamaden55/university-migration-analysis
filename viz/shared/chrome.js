"use strict";
window.VIZ = window.VIZ || {};

// 3ページ共通のヘッダ。「同じデータの見方を切り替えるタブ」と「年度」と「配色」だけを持つ。
// ビュー固有の操作（実数/構成比、並び順など）はここに上げない。
// 全ビューで意味が同じものだけを共通にする。
//
// タブには切り口の副題を添える。「ヒートマップ / フロー図 / 設置数」だけでは
// 別々の3ページに見え、同じデータを3通りに見ているという関係が読めない。
// 副題がその役をするので、タブ群の上に見出しは置かない（読み上げ用の名前だけ残す）。
VIZ.chrome = (() => {
  const YEARS = OD_DATA.years;
  const SPAN = YEARS.length - 1;

  const TABS = [
    { view: "heatmap", label: "ヒートマップ", sub: "県×県の行列" },
    { view: "graph", label: "フロー図", sub: "地図上の流れ" },
    { view: "schools", label: "設置数", sub: "大学の数と県外進学" },
  ];

  let host = null;
  let slider = null;
  let yearLabel = null;
  let themeButton = null;
  let links = [];

  let t = 0;
  let frozen = false;
  let onYear = () => {};

  // 年度は整数のみ。補間位置を持たない（自動再生を廃したので中間の年度が存在しない）。
  const yearIndex = () => Math.min(SPAN, Math.max(0, Math.round(t)));

  // 年度をまたぐ補間の枠。いまは常に低い側の年度そのものを指す。
  // ビュー側は「2つの年度と混ぜ具合」を受け取る形のままにしてある。
  function frame() {
    const index = yearIndex();
    return { low: index, high: index, f: 0 };
  }

  function markup(options) {
    const tabs = TABS.map((tab) => {
      const current = tab.view === options.view ? ' aria-current="page"' : "";
      return `<a href="${VIZ.state.linkTo(tab.view)}"${current}>`
        + `<span class="name">${tab.label}</span>`
        + `<span class="sub">${tab.sub}</span></a>`;
    }).join("");

    return `<div class="group">
        <nav class="tabs" aria-label="同じデータの見方">${tabs}</nav>
      </div>
      <div class="group timeline">
        <label class="caption" for="viz-slider">年度</label>
        <input type="range" id="viz-slider" min="0" max="${SPAN}" step="1" value="0"
               aria-valuetext="${YEARS[0]}年度">
        <output class="year" id="viz-year" for="viz-slider">${YEARS[0]}<small>年度</small></output>
        ${options.note ? `<span class="note">${options.note}</span>` : ""}
      </div>
      <button type="button" class="button push-right" id="viz-theme">配色: 明</button>`;
  }

  function setLabel() {
    const index = yearIndex();
    yearLabel.innerHTML = `${YEARS[index]}<small>年度</small>`;
    slider.setAttribute("aria-valuetext", `${YEARS[index]}年度`);
  }

  function setT(value, { fromSlider = false } = {}) {
    t = Math.max(0, Math.min(SPAN, Math.round(value)));
    if (!fromSlider) slider.value = String(t);
    setLabel();
    onYear(t);
  }

  function commitYear() {
    if (frozen) return;
    VIZ.state.patch({ year: YEARS[yearIndex()] });
  }

  function syncLinks() {
    for (const link of links) link.href = VIZ.state.linkTo(link.dataset.view);
  }

  function syncTheme() {
    themeButton.textContent = `配色: ${VIZ.theme.isDark() ? "暗" : "明"}`;
  }

  function mount(options) {
    host = document.getElementById("viz-chrome");
    host.className = "chrome";
    host.innerHTML = markup(options);

    slider = document.getElementById("viz-slider");
    yearLabel = document.getElementById("viz-year");
    themeButton = document.getElementById("viz-theme");

    links = [...host.querySelectorAll(".tabs a")];
    links.forEach((link, index) => { link.dataset.view = TABS[index].view; });

    onYear = options.onYear || onYear;
    frozen = Boolean(options.frozen);

    // つまみを動かしている間は描き直すだけ。手を離したところで URL に書く。
    // file:// では replaceState が拒まれてハッシュ直書きになるので、1コマごとに
    // 書くと履歴がつまみの通り道ぶん積み上がる。
    slider.addEventListener("input", () => setT(Number(slider.value), { fromSlider: true }));
    slider.addEventListener("change", commitYear);
    themeButton.addEventListener("click", () => {
      VIZ.theme.toggle();
      syncTheme();
      if (options.onTheme) options.onTheme();
    });

    VIZ.theme.onChange(() => {
      syncTheme();
      if (options.onTheme) options.onTheme();
    });
    VIZ.state.onWrite(syncLinks);
    syncTheme();

    // 学校数のように単年度しかないビューでは、動かせない理由を隠さずに止める。
    if (frozen) slider.disabled = true;

    const start = frozen ? options.frozenYear : VIZ.state.get().year;
    setT(Math.max(0, YEARS.indexOf(start)));
    commitYear();
  }

  return { mount, t: () => t, yearIndex, frame, setT };
})();
