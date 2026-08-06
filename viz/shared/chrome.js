"use strict";
window.VIZ = window.VIZ || {};

// 3ページ共通のヘッダ。タブ・年スライダ・再生・配色トグルだけを持つ。
// ビュー固有の操作（実数/構成比、しきい値、並び順など）はここに上げない。
// 全ビューで意味が同じものだけを共通にする。
VIZ.chrome = (() => {
  const YEARS = OD_DATA.years;
  const SPAN = YEARS.length - 1;
  const SEGMENT_MS = 1100;   // 1年ぶんの送り時間

  const TABS = [
    { view: "heatmap", label: "ヒートマップ" },
    { view: "graph", label: "フロー図" },
    { view: "schools", label: "設置数" },
  ];

  let host = null;
  let slider = null;
  let playButton = null;
  let yearLabel = null;
  let themeButton = null;
  let links = [];

  let t = 0;
  let playing = false;
  let frozen = false;
  let rafId = 0;
  let lastStamp = 0;
  let rawT = 0;
  let onYear = () => {};

  // 補間はあくまで見せ方の話。数値は必ず最寄りの年度の実数を使う。
  const yearIndex = () => Math.min(SPAN, Math.max(0, Math.round(t)));

  // 年度間の補間位置。低い方・高い方・その間の比を返す。
  function frame() {
    const low = Math.floor(t);
    return { low, high: Math.min(SPAN, low + 1), f: t - low };
  }

  function markup(options) {
    const tabs = TABS.map((tab) => {
      const current = tab.view === options.view ? ' aria-current="page"' : "";
      return `<a href="${VIZ.state.linkTo(tab.view)}"${current}>${tab.label}</a>`;
    }).join("");

    return `<nav class="tabs" aria-label="表示の切り替え">${tabs}</nav>
      <button type="button" class="button" id="viz-play">▶ 再生</button>
      <div class="timeline">
        <input type="range" id="viz-slider" min="0" max="1000" step="1" value="0"
               aria-label="年度" aria-valuetext="${YEARS[0]}年度">
        <div class="year" id="viz-year">${YEARS[0]}<small>年度</small></div>
      </div>
      ${options.note ? `<span class="note">${options.note}</span>` : ""}
      <button type="button" class="button push-right" id="viz-theme">配色: 明</button>`;
  }

  function setLabel() {
    const nearest = yearIndex();
    const between = Math.abs(t - nearest) > 0.02;
    const caption = between
      ? `${YEARS[Math.floor(t)]} → ${YEARS[Math.ceil(t)]}`
      : "年度";
    yearLabel.innerHTML = `${YEARS[nearest]}<small>${caption}</small>`;
    slider.setAttribute("aria-valuetext", `${YEARS[nearest]}年度`);
  }

  function setT(value, { fromSlider = false } = {}) {
    t = Math.max(0, Math.min(SPAN, value));
    if (!fromSlider) slider.value = String(Math.round(t / SPAN * 1000));
    setLabel();
    onYear(t);
  }

  // ハッシュに書くのは整数年度だけ。しかも手が止まったところでしか書かない。
  // 再生の1コマごとに書くと、URL の書き換えが毎秒何度も走るうえ、
  // 共有した URL が補間の途中を指すことになる。
  function commitYear() {
    if (frozen) return;
    VIZ.state.patch({ year: YEARS[yearIndex()] });
  }

  function ease(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function tick(stamp) {
    if (!playing) return;
    const delta = lastStamp ? (stamp - lastStamp) : 0;
    lastStamp = stamp;
    rawT += delta / SEGMENT_MS;
    if (rawT >= SPAN) rawT = 0;
    const segment = Math.floor(rawT);
    setT(segment + ease(rawT - segment));
    rafId = requestAnimationFrame(tick);
  }

  function play() {
    if (frozen) return;
    playing = true;
    playButton.textContent = "❙❙ 停止";
    rawT = t >= SPAN - 0.001 ? 0 : t;
    lastStamp = 0;
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (!playing) return;
    playing = false;
    playButton.textContent = "▶ 再生";
    cancelAnimationFrame(rafId);
    commitYear();
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
    playButton = document.getElementById("viz-play");
    yearLabel = document.getElementById("viz-year");
    themeButton = document.getElementById("viz-theme");

    links = [...host.querySelectorAll(".tabs a")];
    links.forEach((link, index) => { link.dataset.view = TABS[index].view; });

    onYear = options.onYear || onYear;
    frozen = Boolean(options.frozen);

    slider.addEventListener("input", () => {
      stop();
      setT(Number(slider.value) / 1000 * SPAN, { fromSlider: true });
    });
    slider.addEventListener("change", commitYear);
    playButton.addEventListener("click", () => (playing ? stop() : play()));
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
    if (frozen) {
      slider.disabled = true;
      playButton.disabled = true;
    }

    const start = frozen ? options.frozenYear : VIZ.state.get().year;
    setT(Math.max(0, YEARS.indexOf(start)));
    commitYear();
  }

  return { mount, t: () => t, yearIndex, frame, setT, stop };
})();
