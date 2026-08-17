-- 002 — dış kaynak (outsourcing) kolonları
--
-- Bazı işleri kendi ekibimiz değil dışarıdan bir satıcı yapıyor. Kime ne kadar
-- ödeneceği artık gerçek kolonlarda.
--
-- NEDEN KOLON, NEDEN NOT ALANI DEĞİL: bu bilgi bir ara `resells.note` içine
-- "#outsourced ad|tutar|kur|ödendi" biçiminde metin olarak gömülmüştü. Üç ayrı
-- şekilde bozuluyordu:
--   * Panelde bir siparişin notunu düzenlemek kaydı siliyordu — form `note`
--     alanını komple üzerine yazıyor (panel/js/orders.js).
--   * Takip botu `/durum` çıktısında notu "Panel notu:" diye yazıyor
--     (tracker/messages.py) — tedarikçi maliyeti operatör kanalına düşüyordu.
--   * Para verisi serbest metinde: kısıt yok, toplama sorgusu yok, sessiz
--     bozulma var.
--
-- Supabase'e 2026-08-17'de uygulandı.
-- Geri alma:
--   alter table public.resells
--     drop column vendor, drop column vendor_cost,
--     drop column vendor_currency, drop column vendor_paid;

alter table public.resells
  add column if not exists vendor          text,
  add column if not exists vendor_cost     numeric(12,2) not null default 0,
  add column if not exists vendor_currency text not null default 'USD',
  add column if not exists vendor_paid     boolean not null default false;

comment on column public.resells.vendor is
  'Isi yapan dis saticinin adi. Bos ise is kendi ekibimizde.';
comment on column public.resells.vendor_cost is
  'Dis saticiya odenecek tutar, vendor_currency biriminde. Kar hesabindan dusulur.';

-- Ödenmemiş dış kaynak borcunu listelemek için.
create index if not exists resells_vendor_borc_idx
  on public.resells (vendor_paid)
  where vendor is not null and archived = false;
