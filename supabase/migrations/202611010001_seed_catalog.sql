insert into public.maps (id, name, short_name) values
  ('ascent', '亞海懸城', 'ASCENT'),
  ('bind', '劫境之地', 'BIND'),
  ('haven', '隱世修所', 'HAVEN'),
  ('split', '雙塔迷城', 'SPLIT')
on conflict (id) do update set name = excluded.name, short_name = excluded.short_name;

insert into public.agents (id, name, role) values
  ('brimstone', 'Brimstone', '控場者'),
  ('sova', 'Sova', '先鋒'),
  ('viper', 'Viper', '控場者'),
  ('killjoy', 'Killjoy', '守衛'),
  ('cypher', 'Cypher', '守衛'),
  ('fade', 'Fade', '先鋒')
on conflict (id) do update set name = excluded.name, role = excluded.role;

insert into public.abilities (id, agent_id, key, name) values
  ('incendiary', 'brimstone', 'Q', '燃燒彈'), ('sky-smoke', 'brimstone', 'E', '煙幕雲'), ('stim-beacon', 'brimstone', 'C', '激勵信標'), ('orbital-strike', 'brimstone', 'X', '天國兵器'),
  ('shock-bolt', 'sova', 'Q', '震擊之箭'), ('recon-bolt', 'sova', 'E', '偵查之箭'), ('owl-drone', 'sova', 'C', '梟型無人機'), ('hunters-fury', 'sova', 'X', '狂獵之怒'),
  ('poison-cloud', 'viper', 'Q', '毒霧雲'), ('toxic-screen', 'viper', 'E', '劇毒幕牆'), ('snake-bite', 'viper', 'C', '蛇咬'), ('vipers-pit', 'viper', 'X', '蝮蛇領域'),
  ('alarmbot', 'killjoy', 'Q', '警報機器人'), ('turret', 'killjoy', 'E', '砲塔'), ('nanoswarm', 'killjoy', 'C', '奈米蜂群'), ('lockdown', 'killjoy', 'X', '全面封鎖'),
  ('cyber-cage', 'cypher', 'Q', '網路牢籠'), ('spycam', 'cypher', 'E', '監視攝影機'), ('trapwire', 'cypher', 'C', '陷阱線'), ('neural-theft', 'cypher', 'X', '神經竊取'),
  ('seize', 'fade', 'Q', '纏縛'), ('haunt', 'fade', 'E', '夜神視界'), ('prowler', 'fade', 'C', '潛獵'), ('nightfall', 'fade', 'X', '夜幕降臨')
on conflict (id) do update set agent_id = excluded.agent_id, key = excluded.key, name = excluded.name;
