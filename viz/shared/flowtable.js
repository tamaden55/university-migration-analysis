"use strict";
window.VIZ = window.VIZ || {};

// 「表で見る」の中身。ヒートマップとフロー図で同じ表を出すために1箇所で持つ。
//
// 県を選んでいるときは、向きで2つに割る。1本の表に両向きを混ぜると
// 「兵庫県 / 大阪府」と「大阪府 / 京都府」が同じ見た目で並び、選んだ県が
// どちらの列に居るかを目で追うことになる。構成比の主語も行ごとに入れ替わり、
// さらに人数順の打ち切りで片方の向きが丸ごと消える。割れば3つとも消える。
VIZ.flowtable = (() => {
  const format = VIZ.format;
  const N = OD_DATA.prefectures.length;

  // 純流入がプラスの県。ここへ向かう流れに色を付けて、偏りを見えるようにする。
  const isPole = (year, index) => OD_DATA.netInflow[year][index] > 0;

  function cell(year, index, { focus = null } = {}) {
    const pole = isPole(year, index);
    const marks = (pole ? '<span class="mark" title="流入超過">▲</span>' : "")
      + (index === focus ? '<span class="badge">県内</span>' : "");
    return `<td class="${pole ? "pole" : ""}">${format.name(index)}${marks}</td>`;
  }

  function table(head, rows) {
    return `<table>
      <thead><tr>${head}</tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>`;
  }

  function cut(shown, total) {
    return shown < total
      ? `<p class="cut">人数の多い順に${shown}件。全${total}件のうち残りは出していない。</p>`
      : "";
  }

  // 選択県が出身。分母は県内進学を含めた全進学者なので、ブロック内で 100% になる。
  function outgoing(year, focus, limit) {
    const total = OD_DATA.outbound[year][focus] + OD_DATA.local[year][focus];
    const all = [];
    for (let j = 0; j < N; j += 1) {
      const movers = OD_DATA.matrix[year][focus][j];
      if (movers > 0) all.push({ j, movers });
    }
    all.sort((a, b) => b.movers - a.movers);

    // 県内進学は順位で切れても必ず出す。どれだけ残ったかが進学先の全体像に要る。
    const shown = all.slice(0, limit);
    if (!shown.some((row) => row.j === focus)) {
      const local = all.find((row) => row.j === focus);
      if (local) {
        shown.push(local);
        shown.sort((a, b) => b.movers - a.movers);
      }
    }

    const rows = shown.map((row) => `<tr>
      ${cell(year, row.j, { focus })}
      <td class="num">${format.count(row.movers)}</td>
      <td class="num">${total ? format.share(row.movers / total) : "–"}</td>
    </tr>`);

    return `<h3>${format.name(focus)}の高校生の進学先</h3>
      <p class="lead">進学者 ${format.count(total)} 人の内訳。県内進学を含む。</p>
      ${table('<th>大学の所在地</th><th class="num">入学者数</th><th class="num">構成比</th>', rows)}
      ${cut(shown.length, all.length)}`;
  }

  // 選択県が進学先。分母は県外からの流入なので、ブロック内で 100% になる。
  function incoming(year, focus, limit) {
    const total = OD_DATA.inbound[year][focus];
    const all = [];
    for (let i = 0; i < N; i += 1) {
      if (i === focus) continue;
      const movers = OD_DATA.matrix[year][i][focus];
      if (movers > 0) all.push({ i, movers });
    }
    all.sort((a, b) => b.movers - a.movers);
    const shown = all.slice(0, limit);

    const rows = shown.map((row) => `<tr>
      <td>${format.name(row.i)}</td>
      <td class="num">${format.count(row.movers)}</td>
      <td class="num">${total ? format.share(row.movers / total) : "–"}</td>
    </tr>`);

    const net = OD_DATA.netInflow[year][focus];
    return `<h3>${format.name(focus)}の大学への入学者（県外から）</h3>
      <p class="lead">県外からの入学者 ${format.count(total)} 人の内訳。
        純流入は ${format.signed(net)} 人（${net > 0 ? "流入超過" : "流出超過"}）。</p>
      ${table('<th>出身高校の所在地</th><th class="num">入学者数</th><th class="num">構成比</th>', rows)}
      ${cut(shown.length, all.length)}`;
  }

  // 県を選んでいないとき。流れの母集団はページごとに違うので、外から受け取る。
  function overall(year, flows, limit, lead) {
    const sorted = flows
      .map(({ i, j }) => ({ i, j, movers: OD_DATA.matrix[year][i][j] }))
      .filter((row) => row.movers > 0)
      .sort((a, b) => b.movers - a.movers);
    const shown = sorted.slice(0, limit);

    const rows = shown.map((row) => {
      const out = OD_DATA.outbound[year][row.i];
      return `<tr>
        <td>${format.name(row.i)}</td>
        ${cell(year, row.j)}
        <td class="num">${format.count(row.movers)}</td>
        <td class="num">${out ? format.share(row.movers / out) : "–"}</td>
      </tr>`;
    });

    return `${lead ? `<p class="lead">${lead}</p>` : ""}
      ${table('<th>出身高校の所在地</th><th>大学の所在地</th>'
        + '<th class="num">入学者数</th><th class="num">流出構成比</th>', rows)}
      ${cut(shown.length, sorted.length)}`;
  }

  const NOTE = '<p class="note">▲ は純流入がプラスの都道府県。'
    + 'その年度に県外から入る人数が、県外へ出る人数を上回っている。</p>';

  // details ごと差し替える。summary は開閉状態を保つため、要素は使い回す。
  function render(root, { year, focus = null, flows = [], limit = 20, lead = "" }) {
    const body = focus === null
      ? overall(year, flows, limit, lead)
      : outgoing(year, focus, limit) + incoming(year, focus, limit);
    root.innerHTML = `<div class="flow-table">${body}${NOTE}</div>`;
  }

  function summaryText(focus, fallback) {
    return focus === null ? fallback : `表で見る（${format.name(focus)}の出入り）`;
  }

  return { render, summaryText };
})();
