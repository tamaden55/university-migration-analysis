// 1. 進学者を最も吸収した都道府県（都道府県間移動のみ）
MATCH ()-[r:ENTERED_UNIVERSITY_IN {year: 2025}]->(destination:Prefecture)
RETURN destination.name AS prefecture, sum(r.movers) AS inbound
ORDER BY inbound DESC;

// 2. 純流入: 流入 - 流出。正なら進学時の受け皿、負なら送り出し側。
MATCH (p:Prefecture)
OPTIONAL MATCH ()-[incoming:ENTERED_UNIVERSITY_IN {year: 2025}]->(p)
WITH p, sum(incoming.movers) AS inbound
OPTIONAL MATCH (p)-[outgoing:ENTERED_UNIVERSITY_IN {year: 2025}]->()
RETURN p.name AS prefecture, inbound, sum(outgoing.movers) AS outbound,
       inbound - sum(outgoing.movers) AS net_inflow
ORDER BY net_inflow DESC;

// 3. 太い矢印: 県外進学の主要な OD ペア。
MATCH (origin:Prefecture)-[r:ENTERED_UNIVERSITY_IN {year: 2025}]->(destination:Prefecture)
RETURN origin.name AS origin, destination.name AS destination, r.movers AS movers
ORDER BY movers DESC
LIMIT 30;

// 4. 相互依存: 双方向の小さい方を結びつきの強さとする。
MATCH (a:Prefecture)-[ab:ENTERED_UNIVERSITY_IN {year: 2025}]->(b:Prefecture)
MATCH (b)-[ba:ENTERED_UNIVERSITY_IN {year: 2025}]->(a)
WHERE a.name < b.name
RETURN a.name AS prefecture_a, b.name AS prefecture_b,
       ab.movers AS a_to_b, ba.movers AS b_to_a,
       CASE WHEN ab.movers < ba.movers THEN ab.movers ELSE ba.movers END AS reciprocal_flow
ORDER BY reciprocal_flow DESC
LIMIT 30;
