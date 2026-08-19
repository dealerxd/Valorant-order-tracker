-- Veri duzeltmesi: gecmis Eldorado siparislerinin hesabi.
--
-- account_id kolonu (009) eklendiginde gecmis kayitlar bos birakilmisti;
-- tahmin edilmedi. Kullanici soyledi: hepsi HILL'den alinmisti.
--
-- Yalnizca Eldorado siparisleri yaziliyor. GameBoost siparisleri BOS
-- kaliyor: HILL bir Eldorado hesabi, GameBoost siparisinin parasi orada
-- birikmiyor -- yazmak havuz gorunumunu yanlislastirir. (Formdaki secici
-- de ayni sebeple hesaplari platforma gore filtreliyor.)
--
-- Id sabitlenmiyor; hesap adiyla bulunuyor.

update resells r
set account_id = (
  select id from market_accounts
  where platform = 'Eldorado' and name = 'HILL'
)
where r.platform = 'Eldorado'
  and r.account_id is null;
