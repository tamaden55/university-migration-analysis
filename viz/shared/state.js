"use strict";
window.VIZ = window.VIZ || {};

// 画面の状態を URL のハッシュに載せる。ページを移ってもリロードしても保たれ、
// URL をそのまま送れば同じ画面が開く。
//
//   #view=heatmap&year=2019&pref=13&mode=share
//
// 載せるのはビューをまたいで意味を持つ状態と、各ビューの見せ方の選択だけ。
// フロー図の拡大位置のように、共有された側に押し付けたくないものは載せない。
VIZ.state = (() => {
  const YEARS = OD_DATA.years;
  const LAST_JIS = OD_DATA.prefectures.length;

  const oneOf = (allowed) => (raw) => (allowed.includes(raw) ? raw : null);
  const integer = (low, high) => (raw) => {
    const value = Number(raw);
    return Number.isInteger(value) && value >= low && value <= high ? value : null;
  };

  const PAGES = { heatmap: "index.html", graph: "graph.html", schools: "schools.html" };

  const SPEC = {
    view: { def: "heatmap", parse: oneOf(Object.keys(PAGES)) },
    year: { def: YEARS[YEARS.length - 1], parse: (raw) => (YEARS.includes(Number(raw)) ? Number(raw) : null) },
    pref: { def: null, parse: integer(1, LAST_JIS) },
    mode: { def: "count", parse: oneOf(["count", "share"]) },
    sort: { def: "count", parse: oneOf(["count", "density", "code"]) },
    axis: { def: "ratio", parse: oneOf(["ratio", "density", "advance"]) },
  };

  // ハッシュに実際に書かれていたキー。既定値と「書かれていない」を区別するために要る。
  let explicit = new Set();

  // 読めない値は既定へ落とす。壊れた URL でも白画面にはしない。
  function parse() {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const values = {};
    explicit = new Set();
    for (const [key, spec] of Object.entries(SPEC)) {
      const raw = params.get(key);
      const parsed = raw === null ? null : spec.parse(raw);
      if (parsed !== null) explicit.add(key);
      values[key] = parsed === null ? spec.def : parsed;
    }
    return values;
  }

  // view と year は既定でも書く。URL を見ただけで何の画面か分かるようにするため。
  function serialize(values) {
    const params = new URLSearchParams();
    for (const [key, spec] of Object.entries(SPEC)) {
      const value = values[key];
      if (value === null || value === undefined) continue;
      if (value === spec.def && key !== "view" && key !== "year") continue;
      params.set(key, String(value));
    }
    return `#${params.toString()}`;
  }

  let current = parse();
  let selfWrite = false;
  const listeners = [];
  const writeListeners = [];

  function get() {
    return { ...current };
  }

  // 自分で書いたハッシュでは購読者を呼ばない。呼ぶと変更元へ戻ってきて堂々巡りになる。
  // 購読が要るのは、利用者が URL を直接いじった場合と戻る操作の場合だけ。
  function patch(changes) {
    current = { ...current, ...changes };
    const hash = serialize(current);
    if (hash !== window.location.hash) {
      const url = window.location.href.split("#")[0] + hash;
      try {
        window.history.replaceState(null, "", url);
      } catch (error) {
        // file:// では replaceState が拒まれることがある。履歴は汚れるが動きは保つ。
        // この書き込みは hashchange を起こすので、自分の変更として捨てる印をつけておく。
        selfWrite = true;
        window.location.hash = hash;
      }
    }
    for (const listener of writeListeners) listener(get());
  }

  function onChange(listener) {
    listeners.push(listener);
  }

  // 書き込みそのものの通知。タブのリンクを現在の状態に追随させるために共通ヘッダが使う。
  // ビュー側は購読しない（自分の変更が自分へ戻ってくるため）。
  function onWrite(listener) {
    writeListeners.push(listener);
  }

  // 利用者がアドレス欄を書き換えた場合と、戻る操作の場合だけここへ来る。
  window.addEventListener("hashchange", () => {
    if (selfWrite) {
      selfWrite = false;
      return;
    }
    current = parse();
    for (const listener of listeners) listener(get());
  });

  // タブのリンク。ビューをまたいで意味を持つ年度と注目県だけを引き継ぐ。
  function linkTo(view) {
    return PAGES[view] + serialize({ view, year: current.year, pref: current.pref });
  }

  // 別のビューを名指しした URL で開かれたら、担当ページへ渡す。ハッシュごと持っていく。
  // view が書かれていない URL（graph.html を直に開いた場合など）は、そのページの担当とみなす。
  function redirectIfNeeded(view) {
    if (!explicit.has("view") || current.view === view) {
      // 読み込んだ時点で URL を正規化する。素の graph.html でも中身が読める形にしておく。
      patch({ view });
      return false;
    }
    window.location.replace(PAGES[current.view] + serialize(current));
    return true;
  }

  return { get, patch, onChange, onWrite, linkTo, redirectIfNeeded, pages: PAGES };
})();
