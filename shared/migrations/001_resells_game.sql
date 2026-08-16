-- 001 — resells.game kolonu
--
-- Panel artık birden fazla oyunun siparişini tutuyor (bkz. shared/domain.json
-- > games). Bot yalnızca `tracked: true` olan oyunları yokluyor; şu an sadece
-- Valorant, çünkü diğerlerinin maç maç ilerleme veren bir API'si yok.
--
-- Bu migration Supabase'e 2026-08-16'da uygulandı (29 sipariş, hepsi valorant
-- oldu). Dosya kayıt amaçlı duruyor — veritabanını sıfırdan kurmak ya da ne
-- yapıldığını görmek gerekirse buradan okunur.
--
-- Geri alma:  alter table public.resells drop column game;

alter table public.resells
  add column if not exists game text not null default 'valorant';

comment on column public.resells.game is
  'Siparisin oyunu; gecerli degerler shared/domain.json > games icinde. Takip botu yalnizca tracked=true olan oyunlari yoklar (su an sadece valorant).';

-- Tracker her turda (game, durum, archived=false) üzerinden süzüyor.
create index if not exists resells_game_durum_idx
  on public.resells (game, durum)
  where archived = false;
