"use strict";
window.VIZ = window.VIZ || {};

// 数値と県名の書式。3ページで同じ見え方に揃えるために1箇所で持つ。
VIZ.format = (() => {
  const number = new Intl.NumberFormat("ja-JP");
  const percent1 = new Intl.NumberFormat("ja-JP", {
    style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1,
  });
  const percent0 = new Intl.NumberFormat("ja-JP", {
    style: "percent", minimumFractionDigits: 0, maximumFractionDigits: 0,
  });

  return {
    count: (value) => number.format(value),
    // 純流入のように符号そのものが情報になる値に使う。
    signed: (value) => `${value > 0 ? "+" : ""}${number.format(value)}`,
    share: (value) => percent1.format(value),
    shareRough: (value) => percent0.format(value),

    name: (index) => OD_DATA.prefectures[index],
    short: (index) => OD_DATA.shortNames[index],

    // URL には JIS コード（1〜47）を載せる。pref=13 が東京と読めるようにするため。
    toJis: (index) => index + 1,
    toIndex: (jis) => jis - 1,
  };
})();
