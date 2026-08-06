// Neo4j Desktop の import ディレクトリに CSV を置いて実行する。
// 既存グラフを消さず、年度を含む一意性で再実行できる形にする。

CREATE CONSTRAINT prefecture_name IF NOT EXISTS
FOR (p:Prefecture) REQUIRE p.name IS UNIQUE;

LOAD CSV WITH HEADERS FROM 'file:///prefectures_2025.csv' AS row
MERGE (p:Prefecture {name: row.prefecture})
SET p.entrants_from_prefecture = toInteger(row.entrants_from_prefecture),
    p.local_entrants = toInteger(row.local_entrants),
    p.outbound_entrants = toInteger(row.outbound_entrants),
    p.inbound_entrants = toInteger(row.inbound_entrants),
    p.net_inflow = toInteger(row.net_inflow),
    p.out_of_prefecture_rate = toFloat(row.out_of_prefecture_rate),
    p.metrics_year = toInteger(row.year);

LOAD CSV WITH HEADERS FROM 'file:///od_edges_2025.csv' AS row
MATCH (origin:Prefecture {name: row.origin_prefecture})
MATCH (destination:Prefecture {name: row.destination_prefecture})
MERGE (origin)-[r:ENTERED_UNIVERSITY_IN {year: toInteger(row.year)}]->(destination)
SET r.movers = toInteger(row.movers);
