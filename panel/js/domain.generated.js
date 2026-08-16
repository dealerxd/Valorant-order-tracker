/* ============================================================
   URETILMIS DOSYA - ELLE DUZENLEME
   Kaynak: shared/domain.json
   Yeniden uret: python shared/generate.py
   ============================================================ */

/* Tablo isimleri (tracker ayni dosyadan okuyor) */
const TABLES = {"orders": "resells", "state": "tracker_state", "matches": "tracker_matches"};

/* Panelde secilebilen rank'lar, dusukten yuksege.
   Iron ve Radiant bilincli olarak yok - bkz. shared/domain.json */
const RANK_ORDER = ["Bronze 1", "Bronze 2", "Bronze 3", "Silver 1", "Silver 2", "Silver 3", "Gold 1", "Gold 2", "Gold 3", "Plat 1", "Plat 2", "Plat 3", "Diamond 1", "Diamond 2", "Diamond 3", "Ascendant 1", "Ascendant 2", "Ascendant 3", "Immortal 1", "Immortal 2", "Immortal 3"];
const RANK_TIER = {"Bronze 1": 6, "Bronze 2": 7, "Bronze 3": 8, "Silver 1": 9, "Silver 2": 10, "Silver 3": 11, "Gold 1": 12, "Gold 2": 13, "Gold 3": 14, "Plat 1": 15, "Plat 2": 16, "Plat 3": 17, "Diamond 1": 18, "Diamond 2": 19, "Diamond 3": 20, "Ascendant 1": 21, "Ascendant 2": 22, "Ascendant 3": 23, "Immortal 1": 24, "Immortal 2": 25, "Immortal 3": 26};

/* Bolgeler */
const REGION_VALUES = ["TR", "EU", "NA", "Diğer"];
const REGION_MULT = {"TR": 1.0, "EU": 1.0, "NA": 1.05, "Diğer": 1.1, "AP": 1.1, "KR": 1.1, "LATAM": 1.1, "BR": 1.1};

/* Siparis durumlari */
const STATUS_LABEL = {"yeni": "Yeni", "atandi": "Atandı", "devam": "Devam", "tamam": "Tamam", "odendi": "Ödendi"};
const NEXT_STATUS = {"yeni": "atandi", "atandi": "devam", "devam": "tamam"};
const FORM_STATUSES = ["yeni", "atandi", "devam", "tamam"];

/* Bolge <select>'lerini doldurur. Secenekler HTML'e gomulu degil ki
   liste degistiginde tek yerden guncellensin. */
function fillRegionSelects(){
  document.querySelectorAll('select[data-region]').forEach(sel=>{
    const keep = sel.value;
    sel.innerHTML = REGION_VALUES.map(r=>`<option value="${r}">${r}</option>`).join('');
    sel.value = REGION_VALUES.includes(keep) ? keep : REGION_VALUES[0];
  });
}

/* Durum <select>'ini doldurur (formda secilebilir olanlar). */
function fillStatusSelects(){
  document.querySelectorAll('select[data-status]').forEach(sel=>{
    const keep = sel.value;
    sel.innerHTML = FORM_STATUSES.map(s=>`<option value="${s}">${STATUS_LABEL[s]}</option>`).join('');
    if(FORM_STATUSES.includes(keep)) sel.value = keep;
  });
}
