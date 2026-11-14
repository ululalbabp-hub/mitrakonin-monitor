import {
  html, raw, api, foto as fotoKotak, sesi, toast, modal, konfirmasi, memuat, kosong, pill, bar, ikon, kurvaS, dataForm, isiUlang,
  rp, rpS, pct, angka, tgl, jam, tglPanjang, hariIni, selisihHari, tambahHari, warnaKelas, statusKelas, lencana, berkasKeBase64, pergi, unduhBerkas,
} from '../inti.js';
import { konfigurasi, pilihanSheet } from './umum.js';

// ======================================================================= util
const URUT_WARNA = { Merah: 3, Kuning: 2, Hijau: 1, Abu: 0 };
function tingkat(x) {
  if (x.proyek.status === 'Persiapan') return { label: 'Persiapan', kelas: 'info', skor: -1 };
  if (x.proyek.status === 'Selesai') return { label: 'Selesai', kelas: 'ok', skor: -2 };
  if (x.proyek.status === 'Ditunda') return { label: 'Ditunda', kelas: 'info', skor: -1 };
  const w = Object.values(x.indikator || {}).reduce((m, i) => Math.max(m, URUT_WARNA[i.warna] || 0), 0);
  return w === 3 ? { label: 'Kritis', kelas: 'bad', skor: 3 } : w === 2 ? { label: 'Perhatian', kelas: 'warn', skor: 2 } : { label: 'Aman', kelas: 'ok', skor: 1 };
}
function pillIndikator(ind, r) {
  const o = [];
  const p = (k, teks) => { const i = ind[k]; if (i && i.nilai !== null) o.push(pill(teks, warnaKelas(i.warna))); };
  p('deviasi', 'Jadwal ' + pct(ind.deviasi && ind.deviasi.nilai, 1, true));
  p('indeks_biaya', 'Indeks biaya ' + angka(ind.indeks_biaya && ind.indeks_biaya.nilai, 2));
  if (ind.stok && ind.stok.nilai !== null) o.push(pill(ind.stok.warna === 'Hijau' ? 'Stok aman' : 'Stok ±' + angka(ind.stok.nilai, 0) + ' hari', warnaKelas(ind.stok.warna)));
  if (ind.termin && ind.termin.nilai) o.push(pill('Termin lewat ' + ind.termin.nilai + ' hari', warnaKelas(ind.termin.warna)));
  if (ind.laporan && ind.laporan.warna !== 'Hijau' && ind.laporan.nilai !== null) o.push(pill('Laporan ' + ind.laporan.nilai + ' hari lalu', warnaKelas(ind.laporan.warna)));
  if (r && r.menunggu) { const m = r.menunggu.PROGRES + r.menunggu.MATERIAL_TRX + r.menunggu.BIAYA; if (m) o.push(pill(m + ' menunggu', warnaKelas(ind.approval && ind.approval.warna))); }
  return o;
}
function sisaHari(p) { return p.tgl_selesai_rencana ? selisihHari(hariIni(), p.tgl_selesai_rencana) : null; }
async function semuaProyek() { return api('list', { tab: 'PROYEK' }, { cache: true }); }
function pilihanHtml(list, nilai) { return list.map((x) => html`<option value="${x}" ${String(x) === String(nilai) ? 'selected' : ''}>${x}</option>`); }

function kartuProyek(x) {
  const p = x.proyek, r = x.ringkas, t = tingkat(x), sisa = sisaHari(p);
  return html`<a class="kartu" href="#/p/proyek/${p.proyek_id}">
    <div class="baris" style="align-items:flex-start"><div class="kolom"><span class="tebal">${p.nama}</span><span class="redup">${p.lokasi || '–'} · ${p.client_nama || '–'}</span></div>${pill(t.label, t.kelas)}</div>
    ${r.jumlah_item ? html`
      <div class="baris kecil"><span>Realisasi <b>${pct(r.realisasi_pct)}</b> · ${r.ada_jadwal ? 'Rencana ' + pct(r.rencana_pct) : 'Jadwal belum diisi'}</span>${r.deviasi !== null ? html`<b style="color:${r.deviasi >= 0 ? '#1C6B3C' : '#A3261B'}">${pct(r.deviasi, 2, true)}</b>` : ''}</div>
      ${bar(r.realisasi_pct, r.rencana_pct)}
      <div class="pills">${pillIndikator(x.indikator, r)}${sisa !== null && p.status === 'Berjalan' ? pill(sisa >= 0 ? 'Sisa ' + sisa + ' hari' : 'Lewat ' + -sisa + ' hari', sisa >= 0 ? 'info' : 'bad') : ''}</div>`
    : html`<div class="baris kecil"><span>RAB belum diimport</span><span class="redup">${p.tgl_mulai ? 'Mulai ' + tgl(p.tgl_mulai) : ''}</span></div>`}
  </a>`;
}

// ======================================================================= dashboard
export async function dashboard(p, q, tampilkan) {
  const u = sesi.user();
  tampilkan({ judul: 'Halo, ' + u.nama.split(' ')[0], sub: tglPanjang(), nav: '#/p', isi: memuat() });
  const [d, antri, risiko] = await Promise.all([
    api('dashboard', {}, { cache: true }),
    api('antrianApproval', {}, { cache: true }).catch(() => []),
    api('list', { tab: 'RISIKO', where: { status: 'Terbuka' } }, { cache: true }).catch(() => []),
  ]);
  lencana.menunggu = antri.length;
  const list = d.proyek.slice().sort((a, b) => tingkat(b).skor - tingkat(a).skor);
  const aktif = list.filter((x) => x.proyek.status === 'Berjalan');
  const sum = (f) => aktif.reduce((s, x) => s + (f(x) || 0), 0);
  const nama = {}; list.forEach((x) => { nama[x.proyek.proyek_id] = x.proyek; });
  const perProyek = {}; antri.forEach((a) => { perProyek[a.proyek_id] = (perProyek[a.proyek_id] || 0) + 1; });
  const merah = risiko.filter((r) => r.indikator === 'Merah' || Number(r.skor) >= 6);
  const kpi = html`<div class="grid2 grid4-lebar">
      <div class="kpi"><div class="redup">Proyek aktif</div><div class="nilai">${aktif.length} <span class="redup" style="font-weight:600">${list.filter((x) => x.proyek.status === 'Persiapan').length ? '+' + list.filter((x) => x.proyek.status === 'Persiapan').length + ' persiapan' : ''}</span></div></div>
      <div class="kpi"><div class="redup">Nilai kontrak aktif</div><div class="nilai">${rpS(sum((x) => x.ringkas.nilai_kontrak || x.ringkas.rab_final))}</div></div>
      <div class="kpi"><div class="redup">Nilai terpasang</div><div class="nilai">${rpS(sum((x) => x.ringkas.nilai_terpasang))}</div></div>
      <div class="kpi"><div class="redup">Biaya aktual</div><div class="nilai">${rpS(sum((x) => x.ringkas.biaya_aktual))}</div></div>
    </div>`;
  const aksiCepat = html`<div class="aksi-cepat hanya-hp">
      <a href="#/p/proyek-baru"><span>${ikon('plus')}</span>Proyek baru</a>
      <a href="#/p/rab"><span>${ikon('rab')}</span>RAB &amp; CCO</a>
      <a href="#/p/laporan"><span>${ikon('laporan')}</span>Laporan</a>
      <a href="#/p/pengguna"><span>${ikon('pengguna')}</span>Pengguna</a></div>`;
  const bannerApproval = antri.length ? html`<a class="kartu kuning" href="#/p/approval" style="flex-direction:row;align-items:center;gap:12px">
      <span style="width:40px;height:40px;border-radius:12px;background:#F2A91E;color:#0B2149;display:flex;align-items:center;justify-content:center;font-weight:800;font-family:Montserrat,sans-serif;flex:none">${antri.length}</span>
      <span class="kolom" style="flex:1"><b>Input menunggu approval</b><span class="redup">${Object.keys(perProyek).map((k) => perProyek[k] + ' dari ' + ((nama[k] || {}).kode || k)).join(' · ')}</span></span>${ikon('kanan', 18)}</a>` : '';
  const kartuRisiko = merah.length ? html`<div class="kartu"><div class="baris"><span class="judul-kartu">Risiko terbuka</span>${pill(merah.length, 'bad')}</div>
      <div class="daftar">${merah.slice(0, 6).map((r) => html`<a href="#/p/proyek/${r.proyek_id}?tab=risiko" style="display:flex;gap:10px;text-decoration:none;color:inherit"><span class="titik" style="background:#C0392B"></span><span class="kolom"><span class="kecil tebal">${(nama[r.proyek_id] || {}).kode || ''} — ${String(r.deskripsi).replace(/^\[[^\]]+\]\s*/, '')}</span><span class="redup">${r.kategori} · ${r.sumber} ${tgl(r.tanggal, false)}${r.pic ? ' · PIC ' + r.pic : ''}</span></span></a>`)}</div></div>` : '';
  const tabelLebar = html`<div class="kartu hanya-lebar" style="padding:0;overflow:hidden">
      <div class="baris" style="padding:14px 14px 0"><span class="judul-seksi">Semua proyek</span><span class="redup">urut dari paling kritis</span></div>
      <div class="tabel-wrap" style="border:0;border-radius:0"><table>
        <thead><tr><th>Proyek</th><th class="angka">Nilai</th><th>Progres</th><th class="angka">Deviasi</th><th class="angka">Indeks biaya</th><th>Material</th><th>Sisa waktu</th><th>Status</th></tr></thead>
        <tbody>${list.map((x) => { const r = x.ringkas, t = tingkat(x), s = sisaHari(x.proyek); return html`<tr style="cursor:pointer" data-aksi="buka" data-id="${x.proyek.proyek_id}">
          <td><a href="#/p/proyek/${x.proyek.proyek_id}" class="tebal" style="color:inherit;text-decoration:none">${x.proyek.nama}</a><div class="redup">${x.proyek.lokasi || ''} · ${x.proyek.client_nama || ''}</div></td>
          <td class="angka">${rpS(r.nilai_kontrak || r.rab_final)}</td>
          <td style="min-width:140px">${r.jumlah_item ? html`<b>${pct(r.realisasi_pct)}</b>${bar(r.realisasi_pct, r.rencana_pct)}` : html`<span class="redup">RAB belum ada</span>`}</td>
          <td class="angka">${r.deviasi !== null ? pill(pct(r.deviasi, 2, true), warnaKelas(x.indikator.deviasi.warna)) : html`<span class="redup">${r.jumlah_item ? 'jadwal belum diisi' : '–'}</span>`}</td>
          <td class="angka">${r.indeks_biaya !== null ? pill(angka(r.indeks_biaya, 2), warnaKelas(x.indikator.indeks_biaya.warna)) : '–'}</td>
          <td>${x.indikator.stok.nilai !== null ? pill(x.indikator.stok.warna === 'Hijau' ? 'Aman' : '±' + angka(x.indikator.stok.nilai, 0) + ' hari', warnaKelas(x.indikator.stok.warna)) : '–'}</td>
          <td>${s !== null && x.proyek.status === 'Berjalan' ? s + ' hari' : x.proyek.tgl_mulai ? 'mulai ' + tgl(x.proyek.tgl_mulai) : '–'}</td>
          <td>${pill(t.label, t.kelas)}</td></tr>`; })}</tbody></table></div></div>`;
  tampilkan({
    judul: 'Halo, ' + u.nama.split(' ')[0], sub: tglPanjang() + ' · Pengelola', nav: '#/p',
    kanan: html`<a class="ikon-btn hanya-lebar" href="#/p/proyek-baru" aria-label="Proyek baru" title="Proyek baru">${ikon('plus')}</a>`,
    isi: html`${kpi}${aksiCepat}${bannerApproval}
      <div class="tiga-kolom"><div style="display:flex;flex-direction:column;gap:12px">
        <div class="baris hanya-hp"><span class="judul-seksi">Semua proyek</span><span class="redup">urut dari paling kritis</span></div>
        <div class="hanya-hp" style="display:flex;flex-direction:column;gap:12px">${list.length ? list.map(kartuProyek) : kosong('Belum ada proyek. Mulai dari “Proyek baru”.')}</div>
        ${tabelLebar}</div>
        <div style="display:flex;flex-direction:column;gap:12px">
          ${antri.length ? html`<div class="kartu hanya-lebar"><div class="baris"><span class="judul-kartu">Menunggu approval</span><a href="#/p/approval" class="kecil tebal">Buka semua (${antri.length})</a></div><div class="daftar">${antri.slice(0, 5).map((a) => html`<div class="kolom"><span class="kecil tebal">${judulInput(a)}</span><span class="redup">${labelTab(a._tab)} · ${(nama[a.proyek_id] || {}).kode || ''} · ${a._input_nama} · ${tgl(a.tanggal, false)}</span></div>`)}</div></div>` : ''}
          ${kartuRisiko}
        </div></div>`,
    aksi: { buka: (el, e) => { if (!e.target.closest('a')) pergi('#/p/proyek/' + el.dataset.id); } },
  });
}

export async function daftarProyek(p, q, tampilkan) {
  tampilkan({ judul: 'Proyek', nav: '#/p/proyek', isi: memuat() });
  const d = await api('dashboard', {}, { cache: true });
  const list = d.proyek.slice().sort((a, b) => tingkat(b).skor - tingkat(a).skor);
  tampilkan({
    judul: 'Proyek', sub: list.length + ' proyek', nav: '#/p/proyek',
    kanan: html`<a class="ikon-btn" href="#/p/proyek-baru" aria-label="Proyek baru">${ikon('plus')}</a>`,
    isi: html`<a class="btn emas" href="#/p/proyek-baru">${ikon('plus', 18)} Proyek baru</a>
      <div class="grid-proyek" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">${list.length ? list.map(kartuProyek) : kosong('Belum ada proyek.')}</div>`,
  });
}

// ======================================================================= detail proyek
export async function detailProyek([pid], q, tampilkan) {
  const tab = q.tab || 'progres';
  const tabs = ['progres', 'keuangan', 'material', 'risiko'].map((k) => ({ label: k[0].toUpperCase() + k.slice(1), href: '#/p/proyek/' + pid + '?tab=' + k, on: k === tab }));
  tampilkan({ judul: 'Memuat proyek…', kembali: '#/p', tabs, nav: '#/p/proyek', isi: memuat() });
  const [h, media, trxMaterial] = await Promise.all([
    api('dashboardProyek', { proyek_id: pid }, { cache: true }),
    api('list', { tab: 'MEDIA', proyek_id: pid }, { cache: true }).catch(() => []),
    api('list', { tab: 'MATERIAL_TRX', proyek_id: pid, limit: 30 }, { cache: true }).catch(() => []),
  ]);
  const p = h.proyek, r = h.ringkas, t = tingkat({ proyek: p, indikator: h.indikator });
  const hariKe = p.tgl_mulai ? selisihHari(p.tgl_mulai, hariIni()) + 1 : null, durasi = Number(p.durasi_hari) || null;
  const foto = media.filter((m) => m.ref_tipe === 'PROGRES' && (m.tipe === 'FOTO' || m.tipe === 'VIDEO')).slice(-12).reverse();
  let isi;
  if (!r.jumlah_item) {
    isi = html`<div class="kartu kuning"><b>RAB belum diimport</b><span class="kecil">Import file RAB agar progres, bobot, dan keuangan bisa dihitung.</span><a class="btn" href="#/p/import/${pid}">Import RAB</a></div>${kartuInfoProyek(p)}`;
  } else if (tab === 'progres') {
    isi = html`
      <div class="kartu"><div class="grid3">
        <div class="st"><span class="redup">Realisasi</span><span class="nilai">${pct(r.realisasi_pct)}</span></div>
        <div class="st"><span class="redup">Rencana</span><span class="nilai">${r.ada_jadwal ? pct(r.rencana_pct) : '–'}</span></div>
        <div class="st"><span class="redup">Deviasi</span><span class="nilai" style="color:${r.deviasi === null ? '#5A6782' : r.deviasi >= 0 ? '#1C6B3C' : '#A3261B'}">${r.deviasi === null ? '–' : pct(r.deviasi, 2, true)}</span></div></div>
        ${hariKe !== null ? html`<div class="baris"><span class="redup">Hari ke-${hariKe}${durasi ? ' dari ' + durasi + ' · sisa ' + Math.max(0, durasi - hariKe) + ' hari' : ''}</span><span class="redup">mulai ${tgl(p.tgl_mulai)}</span></div>${durasi ? bar(hariKe / durasi * 100) : ''}` : ''}
        ${!r.ada_jadwal ? html`<a class="kecil tebal" href="#/p/termin/${pid}">Isi jadwal rencana untuk menghitung deviasi →</a>` : r.item_tanpa_jadwal ? html`<span class="redup">${r.item_tanpa_jadwal} item belum punya jadwal.</span>` : ''}
      </div>
      <div class="dua-panel">
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="kartu"><div class="baris"><span class="judul-kartu">Kurva S</span><span class="redup">━ Realisasi ${r.ada_jadwal ? '┅ Rencana' : ''}</span></div>${kurvaS(h.kurva_s, p.tgl_mulai)}</div>
          <div class="kartu"><div class="baris"><span class="judul-kartu">Kegiatan terbaru</span><a class="kecil tebal" href="#/p/approval">Approval</a></div>
            ${foto.length ? html`<div class="foto-baris">${foto.slice(0, 8).map((m) => fotoKotak(m))}</div>` : ''}
            ${h.linimasa.length ? html`<div class="daftar">${h.linimasa.slice(0, 8).map((x) => html`<div class="kolom"><span class="kecil tebal">${x.uraian_item}</span><span class="redup">${tgl(x.tanggal)} · ${x.volume_hari_ini !== '' ? '+' + angka(x.volume_hari_ini, 2) + ' ' + x.satuan : pct(x.persen_kumulatif, 0)} · ${x.uraian_kegiatan || ''}</span></div>`)}</div>` : kosong('Belum ada progres yang disetujui.')}
          </div>
        </div>
        <div class="kartu panel-kanan"><div class="baris"><span class="judul-kartu">Progres per bab</span><span class="redup">bobot → prestasi</span></div>
          ${h.per_bab.filter((b) => b.bobot !== undefined).map((b) => html`<div class="kolom" style="gap:4px"><div class="baris"><span class="kecil tebal">${b.bab_kode}. ${b.bab_nama}</span><span class="kecil" style="white-space:nowrap">${pct(b.progres_bab_pct, 0)} · <b>${pct(b.realisasi)}</b></span></div>${bar(b.progres_bab_pct)}<span class="redup" style="font-size:11px">bobot ${pct(b.bobot)}${r.ada_jadwal ? ' · rencana ' + pct(b.rencana) : ''}</span></div>`)}
        </div>
      </div>
      ${kartuInfoProyek(p)}`;
  } else if (tab === 'keuangan') {
    const kat = r.biaya_per_kategori || {}, maks = Math.max(1, ...Object.values(kat));
    isi = html`
      <div class="kartu"><div class="grid2">
        <div class="st"><span class="redup">Nilai terpasang</span><span class="nilai">${rpS(r.nilai_terpasang)}</span></div>
        <div class="st"><span class="redup">Biaya aktual</span><span class="nilai">${rpS(r.biaya_aktual)}</span></div>
        <div class="st"><span class="redup">Indeks biaya</span><span class="nilai">${r.indeks_biaya === null ? '–' : angka(r.indeks_biaya, 2)}</span></div>
        <div class="st"><span class="redup">Serapan vs prestasi</span><span class="nilai">${pct(r.serapan_pct, 1)} / ${pct(r.realisasi_pct, 1)}</span></div></div>
        ${r.biaya_aktual ? pill(r.selisih_serapan <= 0 ? 'Biaya keluar lebih lambat dari pekerjaan jadi' : 'Biaya keluar ' + angka(r.selisih_serapan, 1) + ' poin lebih cepat dari prestasi', warnaKelas(h.indikator.serapan.warna)) : html`<span class="redup">Belum ada biaya yang disetujui.</span>`}
        <div class="kv"><span>RAB kontrak</span><span>${rp(r.rab_kontrak)}</span><span>RAB final (CCO)</span><span>${rp(r.rab_final)}</span><span>Nilai kontrak</span><span>${rp(r.nilai_kontrak)} ${r.overhead_pct ? '(termasuk overhead ' + r.overhead_pct + '%)' : ''}</span><span>Termin diterima</span><span>${rp(r.termin_diterima)}</span></div>
      </div>
      <div class="dua-panel">
        <div class="kartu"><span class="judul-kartu">Biaya aktual per kategori</span>
          ${Object.keys(kat).map((k) => html`<div class="kolom" style="gap:4px"><div class="baris"><span class="kecil">${k}</span><b class="kecil">${rp(kat[k])}</b></div>${bar(kat[k] / maks * 100)}</div>`)}
          <span class="redup">Material = Σ material MASUK × harga (disetujui). Lainnya dari input biaya + nota.</span></div>
        <div class="kartu"><div class="baris"><span class="judul-kartu">Termin pembayaran client</span><a class="kecil tebal" href="#/p/termin/${pid}">Kelola</a></div>
          ${h.termin.length ? html`<div class="daftar">${h.termin.map((x) => html`<div class="baris"><div class="kolom"><span class="tebal kecil">Termin ${x.termin_ke} — ${pct(x.persen_nilai, 0)}${x.syarat_progres_pct ? ' · syarat progres ' + pct(x.syarat_progres_pct, 0) : ''}</span><span class="redup">${x.status === 'Lunas' ? 'dibayar ' + tgl(x.tgl_bayar) : x.status === 'Ditagih' ? 'ditagih ' + tgl(x.tgl_tagih) + (x.telat_hari ? ' · lewat ' + x.telat_hari + ' hari' : '') : x.siap_ditagih ? 'syarat tercapai — siap ditagih' : 'syarat belum tercapai'}</span></div><div class="kolom" style="align-items:flex-end"><b class="kecil">${rpS(x.nominal)}</b>${pill(x.siap_ditagih ? 'Siap ditagih' : x.status, x.siap_ditagih ? 'warn' : statusKelas(x.status))}</div></div>`)}</div>` : kosong('Belum ada termin.')}</div>
      </div>
      <div class="kartu" style="padding:0;overflow:hidden"><div style="padding:14px 14px 0" class="judul-kartu">RAB vs biaya aktual per bab</div>
        <div class="tabel-wrap" style="border:0;border-radius:0"><table><thead><tr><th>Bab</th><th class="angka">RAB final</th><th class="angka">Terpasang</th><th class="angka">Biaya aktual</th><th class="angka">Indeks</th></tr></thead>
        <tbody>${h.per_bab.map((b) => html`<tr><td>${b.bab_kode}${b.bab_nama ? ' ' + b.bab_nama : ''}</td><td class="angka">${b.rab_final !== undefined ? rpS(b.rab_final) : '–'}</td><td class="angka">${b.nilai_terpasang !== undefined ? rpS(b.nilai_terpasang) : '–'}</td><td class="angka">${rpS(b.biaya_aktual)}</td><td class="angka">${b.biaya_aktual && b.nilai_terpasang !== undefined ? angka(b.nilai_terpasang / b.biaya_aktual, 2) : '–'}</td></tr>`)}</tbody></table></div></div>`;
  } else if (tab === 'material') {
    const trx = trxMaterial;
    isi = html`<div class="dua-panel">
      <div class="kartu"><div class="baris"><span class="judul-kartu">Stok material di lokasi</span><span class="redup">per ${tgl(h.tanggal)}</span></div>
        ${h.stok.length ? html`<div class="daftar">${h.stok.map((s) => html`<div class="kolom" style="gap:6px"><div class="baris"><div class="kolom"><span class="tebal kecil">${s.nama}</span><span class="redup">${s.kode_material} · masuk ${angka(s.masuk, 2)} · pakai ${angka(s.pakai, 2)}${s.retur ? ' · retur ' + angka(s.retur, 2) : ''}${s.transfer ? ' · transfer ' + angka(s.transfer, 2) : ''}</span></div>${pill(s.hari_cukup === null ? 'belum dipakai' : '±' + angka(s.hari_cukup, 0) + ' hari', warnaKelas(s.warna))}</div>
          <div class="baris"><span class="kecil">Saldo <b>${angka(s.saldo, 2)} ${s.satuan}</b> · ${rpS(s.nilai_stok)}</span><span class="redup">laju ${angka(s.laju_pakai, 2)}/hari</span></div></div>`)}</div>` : kosong('Belum ada transaksi material yang disetujui.')}</div>
      <div class="kartu"><span class="judul-kartu">Transaksi terbaru</span>${trx.length ? html`<div class="daftar">${trx.slice().reverse().map((m) => html`<div class="baris"><div class="kolom"><span class="kecil tebal">${m.jenis} · ${m.kode_material} · ${angka(m.qty, 2)}</span><span class="redup">${tgl(m.tanggal)}${m.harga_satuan ? ' · ' + rp(m.harga_satuan) + '/sat' : ''}${m.pemasok ? ' · ' + m.pemasok : ''}</span></div>${pill(m.status, statusKelas(m.status))}</div>`)}</div>` : kosong('Belum ada transaksi.')}</div></div>`;
  } else {
    const ris = (h.risiko || []).slice().sort((a, b) => (a.status === 'Selesai') - (b.status === 'Selesai') || Number(b.skor) - Number(a.skor));
    const hit = (f) => ris.filter(f).length;
    isi = html`<div class="grid3">
        <div class="kartu" style="padding:10px;text-align:center;gap:0"><div class="h" style="font-size:18px;color:#A3261B">${hit((x) => x.status !== 'Selesai' && Number(x.skor) >= 6)}</div><div class="redup">Tinggi</div></div>
        <div class="kartu" style="padding:10px;text-align:center;gap:0"><div class="h" style="font-size:18px;color:#7A4F00">${hit((x) => x.status !== 'Selesai' && Number(x.skor) < 6)}</div><div class="redup">Sedang/rendah</div></div>
        <div class="kartu" style="padding:10px;text-align:center;gap:0"><div class="h" style="font-size:18px;color:#1C6B3C">${hit((x) => x.status === 'Selesai')}</div><div class="redup">Selesai</div></div></div>
      <div class="kartu"><span class="judul-kartu">Indikator saat ini</span><div class="pills">${Object.keys(h.indikator).map((k) => pill(k.replace('_', ' ') + (h.indikator[k].nilai !== null ? ': ' + angka(h.indikator[k].nilai, 2) : ''), warnaKelas(h.indikator[k].warna)))}</div><span class="redup">Indikator merah otomatis membuat risiko dengan usulan mitigasi. Ambang diatur di tab SETTING.</span></div>
      ${ris.map((x) => html`<div class="kartu"><div class="baris">${pill(x.status === 'Selesai' ? 'Selesai' : Number(x.skor) >= 6 ? 'Tinggi · skor ' + x.skor : 'Skor ' + x.skor, x.status === 'Selesai' ? 'ok' : Number(x.skor) >= 6 ? 'bad' : 'warn')}<span class="redup">${x.kategori} · ${x.sumber} · ${tgl(x.tanggal, false)}</span></div>
        <b>${String(x.deskripsi).replace(/^\[[^\]]+\]\s*/, '')}</b>
        <div class="st"><span class="redup tebal">Mitigasi</span><span class="kecil">${x.mitigasi || '–'}</span></div>
        <div class="baris"><span class="redup">PIC ${x.pic || '–'} · target ${tgl(x.target_tgl, false)}</span>${x.status !== 'Selesai' ? html`<span>${x.status === 'Terbuka' ? html`<button class="link-btn" data-aksi="statusRisiko" data-id="${x.risiko_id}" data-st="Dimitigasi">Dimitigasi</button>` : ''}<button class="link-btn" data-aksi="statusRisiko" data-id="${x.risiko_id}" data-st="Selesai">Selesai</button></span>` : ''}</div></div>`)}
      <form class="kartu" data-kirim="tambahRisiko"><span class="judul-kartu">Tambah risiko manual</span>
        <div class="f"><label for="r-desk">Deskripsi</label><textarea id="r-desk" name="deskripsi" required></textarea></div>
        <div class="grid2"><div class="f"><label for="r-kat">Kategori</label><select id="r-kat" name="kategori">${pilihanHtml(pilihanSheet('RISIKO', 'kategori', ['Jadwal', 'Biaya', 'Material', 'Mutu', 'K3', 'Cuaca', 'Client']))}</select></div>
          <div class="f"><label for="r-pic">PIC</label><input id="r-pic" name="pic" type="text" value="${p.project_manager || ''}"></div>
          <div class="f"><label for="r-d">Dampak (1–3)</label><select id="r-d" name="dampak">${pilihanHtml(['1', '2', '3'], '2')}</select></div>
          <div class="f"><label for="r-k">Kemungkinan (1–3)</label><select id="r-k" name="kemungkinan">${pilihanHtml(['1', '2', '3'], '2')}</select></div></div>
        <div class="f"><label for="r-m">Mitigasi</label><textarea id="r-m" name="mitigasi"></textarea></div>
        <div class="f"><label for="r-t">Target</label><input id="r-t" name="target_tgl" type="date" value="${tambahHari(hariIni(), 7)}"></div>
        <button class="btn" type="submit">Simpan risiko</button></form>`;
  }
  tampilkan({
    judul: p.nama, sub: (p.lokasi || '') + (r.nilai_kontrak ? ' · ' + rp(r.nilai_kontrak) : ''), kembali: '#/p', tabs, nav: '#/p/proyek',
    kanan: pill(t.label, t.kelas),
    isi: html`<div class="pills"><a class="pill info" href="#/p/rab/${pid}">RAB &amp; CCO</a><a class="pill info" href="#/p/termin/${pid}">Termin &amp; jadwal</a><a class="pill info" href="#/p/proyek/${pid}/ubah">Ubah data proyek</a>${p.folder_drive_id ? html`<a class="pill info" href="https://drive.google.com/drive/folders/${p.folder_drive_id}" target="_blank" rel="noopener">Folder Drive</a>` : ''}</div>${isi}`,
    aksi: {
      async statusRisiko(el) {
        try { await api('update', { tab: 'RISIKO', id: el.dataset.id, row: { status: el.dataset.st } }); toast('Status risiko diperbarui.'); pergi(location.hash); } catch (e) { toast(e.message, true); }
      },
      async tambahRisiko(f) {
        const d = dataForm(f); d.proyek_id = pid; d.sumber = 'manual'; d.indikator = Number(d.dampak) * Number(d.kemungkinan) >= 6 ? 'Merah' : 'Kuning';
        try { await api('create', { tab: 'RISIKO', row: d }); toast('Risiko disimpan.'); pergi(location.hash); } catch (e) { toast(e.message, true); }
      },
    },
  });
}
function kartuInfoProyek(p) {
  return html`<div class="kartu"><span class="judul-kartu">Data proyek</span><div class="kv">
    <span>Kode</span><span>${p.kode}</span><span>Jenis</span><span>${p.jenis || '–'}</span><span>Client</span><span>${p.client_nama || '–'}${p.client_email ? ' · ' + p.client_email : ''}</span>
    <span>Mulai – selesai</span><span>${tgl(p.tgl_mulai)} – ${tgl(p.tgl_selesai_rencana)} (${p.durasi_hari || '–'} hari)</span><span>Project manager</span><span>${p.project_manager || '–'}</span><span>Status</span><span>${p.status}</span></div></div>`;
}

// ======================================================================= proyek baru / ubah
export async function proyekBaru([pid], q, tampilkan) {
  tampilkan({ judul: pid ? 'Ubah proyek' : 'Proyek baru', kembali: pid ? '#/p/proyek/' + pid : '#/p', nav: '#/p/proyek', isi: memuat() });
  await konfigurasi();
  const [users, proyek] = await Promise.all([api('userList', {}), pid ? api('get', { tab: 'PROYEK', id: pid }) : null]);
  const p = proyek || { overhead_pct: 5, status: 'Persiapan', tgl_mulai: '', durasi_hari: '' };
  const admin = users.filter((x) => x.peran === 'ADMIN' && x.aktif !== false);
  const pengelola = users.filter((x) => x.peran === 'PENGELOLA');
  const jenis = pilihanSheet('PROYEK', 'jenis', ['rumah baru', 'renovasi', 'perbaikan struktur', 'kos', 'komersial', 'lain']);
  tampilkan({
    judul: pid ? 'Ubah proyek' : 'Proyek baru', sub: pid ? p.nama : 'Langkah 1 dari 3 · Data proyek', kembali: pid ? '#/p/proyek/' + pid : '#/p', nav: '#/p/proyek',
    isi: html`<form data-kirim="simpan">
      <div class="kartu"><span class="redup tebal">DATA PROYEK</span>
        <div class="grid2"><div class="f"><label for="kode">Kode proyek</label><input id="kode" name="kode" type="text" required value="${p.kode || ''}" placeholder="mis. KOS-TBT"></div>
        <div class="f"><label for="status">Status</label><select id="status" name="status">${pilihanHtml(pilihanSheet('PROYEK', 'status', ['Persiapan', 'Berjalan', 'Ditunda', 'Selesai']), p.status)}</select></div></div>
        <div class="f"><label for="nama">Nama proyek</label><input id="nama" name="nama" type="text" required value="${p.nama || ''}"></div>
        <div class="f"><span class="lbl">Jenis pekerjaan</span><div class="chips">${jenis.map((j) => html`<label><input type="radio" name="jenis" value="${j}" ${p.jenis === j ? 'checked' : ''}><span>${j[0].toUpperCase() + j.slice(1)}</span></label>`)}</div></div>
        <div class="f"><label for="lokasi">Lokasi</label><input id="lokasi" name="lokasi" type="text" value="${p.lokasi || ''}"></div>
      </div>
      <div class="kartu"><span class="redup tebal">NILAI &amp; WAKTU</span>
        <div class="grid2"><div class="f"><label for="nilai">Nilai kontrak (Rp)</label><input id="nilai" name="nilai_kontrak" type="number" min="0" step="1" value="${p.nilai_kontrak || ''}" inputmode="numeric"><small>Kosongkan: diisi otomatis dari RAB.</small></div>
        <div class="f"><label for="oh">Overhead (%)</label><input id="oh" name="overhead_pct" type="number" min="0" max="50" step="0.1" value="${p.overhead_pct}"></div>
        <div class="f"><label for="durasi">Durasi (hari kalender)</label><input id="durasi" name="durasi_hari" type="number" min="1" value="${p.durasi_hari}" data-ubah="hitungSelesai"></div>
        <div class="f"><label for="mulai">Tanggal mulai</label><input id="mulai" name="tgl_mulai" type="date" value="${p.tgl_mulai}" data-ubah="hitungSelesai"></div></div>
        <span class="redup" id="selesai">Selesai rencana: ${p.tgl_selesai_rencana ? tgl(p.tgl_selesai_rencana) : 'otomatis dari mulai + durasi'}</span>
        <span class="redup">Periode laporan bulanan mengikuti tanggal mulai proyek.</span>
      </div>
      <div class="kartu"><span class="redup tebal">CLIENT &amp; TIM</span>
        <div class="f"><label for="cn">Nama client (pemberi tugas)</label><input id="cn" name="client_nama" type="text" value="${p.client_nama || ''}"></div>
        <div class="f"><label for="ce">Email client (penerima laporan bulanan)</label><input id="ce" name="client_email" type="email" value="${p.client_email || ''}"></div>
        <div class="f"><label for="pm">Project manager</label><input id="pm" name="project_manager" type="text" list="daftar-pm" value="${p.project_manager || ''}"><datalist id="daftar-pm">${pengelola.map((x) => html`<option value="${x.nama}"></option>`)}</datalist></div>
        <div class="f"><span class="lbl">Admin lapangan</span>${admin.length ? html`<div class="chips">${admin.map((a) => html`<label><input type="checkbox" name="admin" value="${a.user_id}" ${pid && String(a.proyek_akses).split(',').includes(pid) ? 'checked' : ''}><span>${a.nama}</span></label>`)}</div>` : html`<small>Belum ada akun admin lapangan. Buat di menu Pengguna.</small>`}</div>
        ${!pid ? html`<label class="cek"><input type="checkbox" name="buat_client"><span>Buat akun client dari email di atas dan kirim password lewat email</span></label>` : ''}
      </div>
      <button class="btn" type="submit">${pid ? 'Simpan perubahan' : 'Simpan & lanjut: Import RAB'}</button>
      <span class="redup" style="text-align:center">Folder Google Drive proyek dibuat otomatis.</span></form>`,
    aksi: {
      hitungSelesai() {
        const m = document.getElementById('mulai').value, d = Number(document.getElementById('durasi').value);
        document.getElementById('selesai').textContent = 'Selesai rencana: ' + (m && d ? tgl(tambahHari(m, d - 1)) : 'otomatis dari mulai + durasi');
      },
      async simpan(f) {
        const d = dataForm(f), b = f.querySelector('[type=submit]');
        const adminDipilih = [].concat(d.admin || []); const buatClient = d.buat_client;
        delete d.admin; delete d.buat_client;
        if (!d.jenis) return toast('Pilih jenis pekerjaan.', true);
        if (d.tgl_mulai && d.durasi_hari) d.tgl_selesai_rencana = tambahHari(d.tgl_mulai, Number(d.durasi_hari) - 1);
        b.disabled = true; b.textContent = 'Menyimpan…';
        try {
          let id = pid;
          if (pid) await api('update', { tab: 'PROYEK', id: pid, row: d });
          else id = (await api('create', { tab: 'PROYEK', row: d })).id;
          for (const a of admin) {
            const punya = String(a.proyek_akses || '').split(',').filter(Boolean), mau = adminDipilih.includes(a.user_id);
            if (mau && !punya.includes(id)) await api('userUpdate', { user_id: a.user_id, proyek_akses: punya.concat(id).join(',') });
            if (!mau && punya.includes(id)) await api('userUpdate', { user_id: a.user_id, proyek_akses: punya.filter((x) => x !== id).join(',') });
          }
          if (buatClient && d.client_email) {
            try { await api('userCreate', { nama: d.client_nama || d.client_email, email: d.client_email, peran: 'CLIENT', proyek_akses: id, kirim_email: true }); toast('Akun client dibuat, password dikirim ke ' + d.client_email); }
            catch (e) { toast('Akun client: ' + e.message, true); }
          }
          toast(pid ? 'Proyek diperbarui.' : 'Proyek dibuat.');
          pergi(pid ? '#/p/proyek/' + id : '#/p/import/' + id);
        } catch (e) { toast(e.message, true); b.disabled = false; b.textContent = 'Simpan'; }
      },
    },
  });
}

// ======================================================================= import RAB
let skripXlsx = null;
function muatSkrip(src) { return new Promise((ok, gagal) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => gagal(new Error('Gagal memuat ' + src)); document.head.appendChild(s); }); }
async function siapkanPembaca() {
  if (!skripXlsx) skripXlsx = Promise.all([window.XLSX ? null : muatSkrip('vendor/xlsx-0.20.3.full.min.js'), window.RabImport ? null : muatSkrip('js/rab-import.js')]);
  await skripXlsx;
}

export async function importRab([pid], q, tampilkan) {
  tampilkan({ judul: 'Import RAB', kembali: '#/p/proyek/' + pid, nav: '#/p/proyek', isi: memuat() });
  const [p, items] = await Promise.all([api('get', { tab: 'PROYEK', id: pid }), api('list', { tab: 'RAB_ITEM', proyek_id: pid, limit: 1 })]);
  if (items.length) {
    return tampilkan({ judul: 'Import RAB', sub: p.nama, kembali: '#/p/proyek/' + pid, nav: '#/p/proyek', isi: html`<div class="kartu kuning"><b>RAB proyek ini sudah diimport dan terkunci.</b><span class="kecil">Perubahan volume/harga dilakukan lewat CCO agar kontrak asli tetap tercatat.</span><a class="btn" href="#/p/rab/${pid}">Buka RAB &amp; CCO</a></div>` });
  }
  await siapkanPembaca();
  const R = window.RabImport;
  let hasil = null, berkas = null;
  const syarat = html`<div class="kartu"><div class="baris"><span class="judul-kartu">Syarat &amp; ketentuan file RAB</span><span class="redup">baca sebelum import</span></div>
    <ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:13px">${R.SYARAT.map((s) => html`<li>${s}</li>`)}</ol>
    <label class="cek"><input type="checkbox" id="setuju" data-ubah="setuju"><span>Saya sudah membaca syarat &amp; ketentuan di atas, dan file RAB yang akan saya upload sudah sesuai. Kebenaran angka RAB menjadi tanggung jawab pengelola yang mengimport.</span></label>
    <label class="btn" id="pilih-file" style="opacity:.5;pointer-events:none">Pilih file RAB (.xlsx)<input type="file" id="file-rab" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-ubah="baca" style="position:absolute;opacity:0;width:1px"></label></div>`;
  const gambar = () => isiUlang(html`${syarat}${hasil ? pratinjau() : ''}`);
  function pratinjau() {
    const d = hasil.data, T = d ? d.ringkasan.total : null, merah = hasil.temuan.filter((t) => t.level === 'MERAH');
    const nilaiProyek = Number(p.nilai_kontrak) || 0;
    return html`<div class="kartu"><div class="baris"><div class="kolom"><b>${berkas.name}</b><span class="redup">${Math.round(berkas.size / 1024)} KB${d ? ' · ' + d.proyek.pekerjaan + ' · ' + d.proyek.owner : ''}</span></div><label class="link-btn" style="cursor:pointer">Ganti<input type="file" accept=".xlsx" data-ubah="baca" style="position:absolute;opacity:0;width:1px"></label></div>
      ${d ? html`<div class="grid3"><div class="st"><span class="redup">Bab</span><span class="nilai">${d.bab.length}</span></div><div class="st"><span class="redup">Item</span><span class="nilai">${d.item.filter((i) => !i.supply_owner).length}</span></div><div class="st"><span class="redup">Overhead</span><span class="nilai">${pct(T.overheadPct, 0)}</span></div></div>` : ''}</div>
      ${d ? html`<div class="kartu" style="padding:0;overflow:hidden"><div class="baris" style="padding:14px 14px 0"><span class="judul-kartu">Pratinjau per bab vs REKAPITULASI</span><span class="redup">toleransi Rp 1.000</span></div>
        <div class="tabel-wrap" style="border:0;border-radius:0;max-height:420px;overflow:auto"><table><thead><tr><th>Bab</th><th>Kategori</th><th class="angka">Item</th><th class="angka">Kontrak</th><th class="angka">Final</th><th class="angka">REKAP final</th><th>Status</th></tr></thead><tbody>
          ${d.ringkasan.bab.map((b) => html`<tr><td><b>${b.kode}</b> ${b.nama}</td><td>${b.supply ? 'Supply by owner' : b.kategori}</td><td class="angka">${b.jumlahItem}</td><td class="angka">${angka(b.itemKontrak)}</td><td class="angka">${b.supply ? '(tidak dihitung)' : angka(b.itemFinal)}</td><td class="angka">${b.supply ? '–' : angka(b.rekapFinal)}</td><td>${b.status === 'COCOK' ? pill('Cocok', 'ok') : pill(b.status, 'bad')}</td></tr>`)}
          <tr class="total"><td colspan="3">Total sebelum overhead</td><td class="angka">${angka(T.kontrak)}</td><td class="angka">${angka(T.final)}</td><td colspan="2"></td></tr>
          <tr class="total"><td colspan="3">Grand total setelah overhead ${pct(T.overheadPct, 0)}</td><td class="angka">${angka(T.grandKontrak)}</td><td class="angka">${angka(T.grandFinal)}</td><td colspan="2"></td></tr>
        </tbody></table></div></div>
        <div class="kartu"><span class="judul-kartu">Bobot per kategori (nilai final)</span><div class="daftar">${d.ringkasan.kategori.map((k) => html`<div class="baris"><span class="kecil">${k.kategori}</span><span class="kecil">${pct(k.itemFinal / d.dasarBobot * 100, 1)} · <b>${rp(k.itemFinal)}</b></span></div>`)}</div>
          ${nilaiProyek && Math.abs(nilaiProyek - T.grandKontrak) > 1000 ? html`<div class="pill warn" style="white-space:normal">Nilai kontrak di data proyek ${rp(nilaiProyek)} berbeda dengan grand total kontrak RAB ${rp(T.grandKontrak)}.</div>` : ''}</div>` : ''}
      <div class="kartu"><div class="baris"><span class="judul-kartu">Temuan</span><span class="pills">${pill(hasil.jumlah.MERAH + ' merah', 'bad')}${pill(hasil.jumlah.KUNING + ' kuning', 'warn')}${pill(hasil.jumlah.INFO + ' info', 'info')}</span></div>
        <div class="daftar">${hasil.temuan.map((t) => html`<div style="display:flex;gap:10px;align-items:flex-start">
          ${t.level === 'MERAH' && !hasil.fatal ? html`<input type="checkbox" class="konf" value="${t.id}" aria-label="Konfirmasi temuan ${t.id}" data-ubah="cekSimpan" style="width:20px;height:20px;margin-top:2px;flex:none;accent-color:#0B2149">` : html`<span class="titik" style="background:${t.level === 'MERAH' ? '#C0392B' : t.level === 'KUNING' ? '#F2A91E' : '#1F4E8C'}"></span>`}
          <span class="kecil">${pill(t.level, t.level === 'MERAH' ? 'bad' : t.level === 'KUNING' ? 'warn' : 'info')} ${t.pesan}</span></div>`)}</div>
        ${hasil.fatal ? html`<div class="pill bad" style="white-space:normal">File belum bisa diimport. Perbaiki temuan merah di atas lalu upload ulang.</div>` : merah.length ? html`<span class="redup">Centang setiap temuan merah sebagai tanda sudah diperiksa. Konfirmasi tercatat di LOG.</span>` : ''}
      </div>
      ${!hasil.fatal ? html`<button class="btn" id="tombol-simpan" data-aksi="simpan" ${merah.length ? 'disabled' : ''}>Simpan RAB &amp; kunci kontrak</button>
        <span class="redup" style="text-align:center">Setelah disimpan, RAB kontrak terkunci. Perubahan lewat CCO. File asli diarsipkan ke folder Drive proyek.</span>` : ''}`;
  }
  tampilkan({
    judul: 'Import RAB', sub: p.nama + ' · Langkah 2 dari 3', kembali: '#/p/proyek/' + pid, nav: '#/p/proyek',
    isi: syarat,
    aksi: {
      setuju(el) { const b = document.getElementById('pilih-file'); b.style.opacity = el.checked ? 1 : 0.5; b.style.pointerEvents = el.checked ? 'auto' : 'none'; },
      async baca(el) {
        const f = el.files[0]; if (!f) return;
        berkas = f;
        isiUlang(html`${syarat}${memuat('Membaca ' + f.name + '…')}`);
        try {
          const cek = R.cekFile({ nama: f.name, ukuranByte: f.size });
          const wb = window.XLSX.read(await f.arrayBuffer(), { type: 'array', cellFormula: true });
          hasil = R.parse(window.XLSX, wb);
          hasil.temuan = cek.concat(hasil.temuan);
          if (cek.some((t) => t.level === 'MERAH')) { hasil.fatal = true; hasil.ok = false; }
          cek.forEach((t, i) => { t.id = 'F' + (i + 1); });
        } catch (e) { hasil = { temuan: [{ level: 'MERAH', kode: 'BACA', pesan: 'File tidak bisa dibaca: ' + e.message, id: 'F0' }], jumlah: { MERAH: 1, KUNING: 0, INFO: 0 }, fatal: true, data: null }; }
        gambar();
        const s = document.getElementById('setuju'); if (s) { s.checked = true; this.setuju(s); }
      },
      cekSimpan() {
        const semua = [...document.querySelectorAll('.konf')], b = document.getElementById('tombol-simpan');
        if (b) b.disabled = !semua.every((c) => c.checked);
      },
      async simpan(el) {
        const konf = [...document.querySelectorAll('.konf:checked')].map((c) => c.value);
        if (!window.RabImport.bolehSimpan(hasil, konf)) return toast('Konfirmasi semua temuan merah dulu.', true);
        if (!(await konfirmasi('Simpan & kunci RAB?', hasil.data.item.length + ' item akan disimpan dan RAB kontrak terkunci. Perubahan berikutnya lewat CCO.', 'Simpan RAB'))) return;
        el.disabled = true; el.textContent = 'Menyimpan ' + hasil.data.item.length + ' item…';
        try {
          const d = hasil.data;
          const r = await api('importRab', {
            proyek_id: pid, items: d.item, cco: d.cco, temuan: hasil.temuan.filter((t) => t.level === 'MERAH'), konfirmasi: konf,
            ringkasan: { grandKontrak: d.ringkasan.total.grandKontrak, grandFinal: d.ringkasan.total.grandFinal, overheadPct: d.ringkasan.total.overheadPct },
            file: { nama: berkas.name, data_base64: await berkasKeBase64(berkas) },
          });
          toast(r.jumlah_item + ' item & ' + r.jumlah_cco + ' CCO tersimpan. File diarsipkan.');
          pergi('#/p/termin/' + pid);
        } catch (e) { toast(e.message, true); el.disabled = false; el.textContent = 'Simpan RAB & kunci kontrak'; }
      },
    },
  });
}

// ======================================================================= termin & jadwal
export async function terminJadwal([pid], q, tampilkan) {
  tampilkan({ judul: 'Termin & jadwal', kembali: '#/p/proyek/' + pid, nav: '#/p/proyek', isi: memuat() });
  await konfigurasi();
  const [p, termin, items, jadwal] = await Promise.all([
    api('get', { tab: 'PROYEK', id: pid }), api('list', { tab: 'TERMIN', proyek_id: pid }),
    api('list', { tab: 'RAB_ITEM', proyek_id: pid }), api('list', { tab: 'JADWAL', proyek_id: pid }),
  ]);
  termin.sort((a, b) => Number(a.termin_ke) - Number(b.termin_ke));
  const nilai = Number(p.nilai_kontrak) || 0, totalPersen = termin.reduce((s, t) => s + (Number(t.persen_nilai) || 0), 0);
  const babs = []; const seen = {};
  items.filter((i) => !(i.supply_owner === true || String(i.supply_owner).toUpperCase() === 'TRUE')).forEach((i) => { if (!seen[i.bab_kode]) { seen[i.bab_kode] = { kode: i.bab_kode, nama: i.bab_nama, item: [] }; babs.push(seen[i.bab_kode]); } seen[i.bab_kode].item.push(i.item_id); });
  const jadwalItem = {}; jadwal.forEach((j) => { jadwalItem[j.item_id] = j; });
  const rentangBab = (b) => { const js = b.item.map((id) => jadwalItem[id]).filter(Boolean); if (!js.length) return null; return { mulai: js.map((j) => j.tgl_mulai).sort()[0], selesai: js.map((j) => j.tgl_selesai).sort().slice(-1)[0], lengkap: js.length === b.item.length }; };
  const mulaiP = p.tgl_mulai || hariIni(), selesaiP = p.tgl_selesai_rencana || tambahHari(mulaiP, 89), totalHari = selisihHari(mulaiP, selesaiP) + 1;
  const gantt = (r) => r ? html`<div style="position:relative;height:16px;background:#F4F6FA;border-radius:4px"><div style="position:absolute;top:3px;height:10px;border-radius:3px;background:#1F4E8C;left:${Math.max(0, selisihHari(mulaiP, r.mulai) / totalHari * 100).toFixed(1)}%;width:${Math.max(1, (selisihHari(r.mulai, r.selesai) + 1) / totalHari * 100).toFixed(1)}%"></div></div>` : html`<div style="height:16px;background:#F4F6FA;border-radius:4px"></div>`;
  tampilkan({
    judul: 'Termin & jadwal', sub: p.nama + ' · Langkah 3 dari 3', kembali: '#/p/proyek/' + pid, nav: '#/p/proyek',
    isi: html`<div class="kartu"><div class="baris"><span class="judul-kartu">Termin pembayaran</span><span class="redup">kontrak ${rp(nilai)}</span></div>
        ${termin.length ? html`<div class="daftar">${termin.map((t) => html`<div class="kolom" style="gap:6px"><div class="baris"><div class="kolom"><b class="kecil">Termin ${t.termin_ke} · ${pct(t.persen_nilai, 0)}${t.syarat_progres_pct ? ' · syarat progres ' + pct(t.syarat_progres_pct, 0) : ''}</b><span class="redup">${rp(t.nominal)}${t.tgl_tagih ? ' · ditagih ' + tgl(t.tgl_tagih) : ''}${t.tgl_bayar ? ' · dibayar ' + tgl(t.tgl_bayar) + ' ' + rp(t.nominal_diterima) : ''}</span></div>${pill(t.status, statusKelas(t.status))}</div>
          <div class="pills">${t.status === 'Belum' ? html`<button class="btn garis kecil" data-aksi="tagih" data-id="${t.termin_id}">Tandai ditagih</button>` : ''}${t.status !== 'Lunas' ? html`<button class="btn garis kecil" data-aksi="lunas" data-id="${t.termin_id}" data-nominal="${t.nominal}">Catat pembayaran</button>` : ''}<button class="link-btn" data-aksi="hapusTermin" data-id="${t.termin_id}">Hapus</button></div></div>`)}</div>
          <div class="baris tebal"><span>Total</span><span>${pct(totalPersen, 0)} · ${rp(termin.reduce((s, t) => s + (Number(t.nominal) || 0), 0))}</span></div>
          ${Math.abs(totalPersen - 100) > 0.01 ? pill('Total persen termin ' + pct(totalPersen, 0) + ', bukan 100%', 'warn') : ''}` : kosong('Belum ada termin.')}
        <form data-kirim="tambahTermin" style="border-top:1px solid #EEF1F6;padding-top:10px"><span class="kecil tebal">+ Tambah termin</span>
          <div class="grid3"><div class="f"><label for="tk">Termin ke</label><input id="tk" name="termin_ke" type="number" min="1" value="${termin.length + 1}" required></div>
          <div class="f"><label for="tp">% nilai</label><input id="tp" name="persen_nilai" type="number" min="0" max="100" step="0.01" required value="${Math.max(0, 100 - totalPersen)}"></div>
          <div class="f"><label for="ts">Syarat progres %</label><input id="ts" name="syarat_progres_pct" type="number" min="0" max="100" step="0.01" value="0"></div></div>
          <button class="btn garis" type="submit">Tambah termin</button></form>
        <span class="redup">Saat progres yang disetujui mencapai syarat termin, dashboard menandai “siap ditagih”.</span></div>
      <form class="kartu" data-kirim="simpanJadwal"><div class="baris"><span class="judul-kartu">Jadwal rencana per bab</span><span class="redup">opsional</span></div>
        <span class="redup">Isi tanggal mulai & selesai tiap bab untuk menghitung rencana, deviasi, dan Kurva S. Tanpa jadwal: dashboard hanya menampilkan realisasi. Pola rata (linear) per item.</span>
        ${babs.length ? babs.map((b) => { const r = rentangBab(b); return html`<div class="kolom" style="gap:6px;border-top:1px solid #EEF1F6;padding-top:8px"><div class="baris"><span class="kecil tebal">${b.kode}. ${b.nama}</span><span class="redup">${b.item.length} item${r && !r.lengkap ? ' · sebagian' : ''}</span></div>${gantt(r)}
            <div class="grid2"><input type="date" name="m_${b.kode}" aria-label="Mulai bab ${b.kode}" value="${r ? r.mulai : ''}" min="${mulaiP}"><input type="date" name="s_${b.kode}" aria-label="Selesai bab ${b.kode}" value="${r ? r.selesai : ''}"></div></div>`; }) : kosong('Import RAB dulu untuk menyusun jadwal.')}
        ${babs.length ? html`<button class="btn garis" type="submit">Simpan jadwal</button>` : ''}</form>
      ${p.status === 'Persiapan' ? html`<button class="btn emas" data-aksi="aktifkan">Aktifkan proyek (status Berjalan)</button><span class="redup" style="text-align:center">Setelah aktif, proyek tampil di dashboard dan dihitung indikatornya.</span>` : html`<a class="btn" href="#/p/proyek/${pid}">Ke dashboard proyek</a>`}`,
    aksi: {
      async tambahTermin(f) {
        const d = dataForm(f); d.proyek_id = pid; d.status = 'Belum';
        if (nilai) d.nominal = Math.round(nilai * Number(d.persen_nilai) / 100);
        try { await api('create', { tab: 'TERMIN', row: d }); toast('Termin ditambahkan.'); pergi(location.hash); } catch (e) { toast(e.message, true); }
      },
      async tagih(el) {
        modal(html`<h3 class="judul-seksi">Tandai termin ditagih</h3><form id="f-tagih"><div class="f"><label for="tt">Tanggal tagih / jatuh tempo</label><input id="tt" type="date" name="tgl_tagih" value="${hariIni()}" required></div><div class="btn-baris"><button type="button" class="btn garis" data-tutup>Batal</button><button class="btn" type="submit">Simpan</button></div></form>`, (panel, tutup) => {
          panel.querySelector('form').onsubmit = async (e) => { e.preventDefault(); try { await api('update', { tab: 'TERMIN', id: el.dataset.id, row: { status: 'Ditagih', tgl_tagih: e.target.tgl_tagih.value } }); tutup(); toast('Termin ditandai ditagih.'); pergi(location.hash); } catch (er) { toast(er.message, true); } };
        });
      },
      async lunas(el) {
        modal(html`<h3 class="judul-seksi">Catat pembayaran termin</h3><form><div class="f"><label for="tb">Tanggal bayar</label><input id="tb" type="date" name="tgl_bayar" value="${hariIni()}" required></div><div class="f"><label for="nd">Nominal diterima (Rp)</label><input id="nd" type="number" name="nominal_diterima" value="${el.dataset.nominal}" required></div><div class="btn-baris"><button type="button" class="btn garis" data-tutup>Batal</button><button class="btn" type="submit">Simpan</button></div></form>`, (panel, tutup) => {
          panel.querySelector('form').onsubmit = async (e) => { e.preventDefault(); const f = e.target; try { await api('update', { tab: 'TERMIN', id: el.dataset.id, row: { status: 'Lunas', tgl_bayar: f.tgl_bayar.value, nominal_diterima: f.nominal_diterima.value } }); tutup(); toast('Pembayaran dicatat.'); pergi(location.hash); } catch (er) { toast(er.message, true); } };
        });
      },
      async hapusTermin(el) { if (await konfirmasi('Hapus termin?', 'Termin ini dihapus dari daftar (tercatat di LOG).', 'Hapus')) { try { await api('remove', { tab: 'TERMIN', id: el.dataset.id }); pergi(location.hash); } catch (e) { toast(e.message, true); } } },
      async simpanJadwal(f) {
        const d = dataForm(f), list = [];
        for (const b of babs) { const m = d['m_' + b.kode], s = d['s_' + b.kode]; if (m && s) list.push({ bab_kode: b.kode, tgl_mulai: m, tgl_selesai: s }); else if (m || s) return toast('Bab ' + b.kode + ': isi tanggal mulai dan selesai.', true); }
        if (!list.length) return toast('Isi minimal satu bab.', true);
        const b = f.querySelector('[type=submit]'); b.disabled = true; b.textContent = 'Menyimpan…';
        try { const r = await api('simpanJadwal', { proyek_id: pid, jadwal: list }); toast('Jadwal ' + r.disimpan + ' item tersimpan.'); pergi(location.hash); } catch (e) { toast(e.message, true); b.disabled = false; b.textContent = 'Simpan jadwal'; }
      },
      async aktifkan() { try { await api('update', { tab: 'PROYEK', id: pid, row: { status: 'Berjalan' } }); toast('Proyek aktif.'); pergi('#/p/proyek/' + pid); } catch (e) { toast(e.message, true); } },
    },
  });
}

// ======================================================================= approval
function labelTab(t) { return { PROGRES: 'Progres', MATERIAL_TRX: 'Material', BIAYA: 'Biaya' }[t] || t; }
function judulInput(a) {
  if (a._tab === 'PROGRES') return (a._item ? a._item.uraian : a.item_id) + ': ' + (a._item && a._item.cara_ukur === 'persen' ? pct(a.persen_kumulatif, 0) + ' kumulatif' : '+' + angka(a.volume_hari_ini, 2) + ' ' + (a._item ? a._item.satuan : ''));
  if (a._tab === 'MATERIAL_TRX') return a.jenis + ' · ' + a.kode_material + ' · ' + angka(a.qty, 2);
  return a.kategori + ' · ' + a.uraian;
}
function detailInput(a) {
  if (a._tab === 'PROGRES') return [['Item RAB', a._item ? a._item.bab_kode + ' · ' + a._item.uraian : a.item_id], ['Laporan', a._item && a._item.cara_ukur === 'persen' ? 'Kumulatif ' + pct(a.persen_kumulatif, 0) : 'Hari ini +' + angka(a.volume_hari_ini, 2) + ' ' + (a._item ? a._item.satuan + ' dari ' + angka(a._item.vol_final, 2) : '')], ['Kegiatan', a.uraian_kegiatan || '–'], ['Cuaca · pekerja', (a.cuaca || '–') + ' · ' + (a.jumlah_pekerja || '–') + ' orang'], ['Hambatan', [a.hambatan_teknis, a.hambatan_nonteknis].filter(Boolean).join(' · ') || '–']];
  if (a._tab === 'MATERIAL_TRX') return [['Jenis', a.jenis], ['Material', a.kode_material + ' · ' + angka(a.qty, 2)], ['Harga satuan', a.harga_satuan ? rp(a.harga_satuan) : '–'], ['Total', a.jenis === 'MASUK' ? rp(a.qty * a.harga_satuan) + ' → biaya material' : '–'], ['Pemasok · SJ', [a.pemasok, a.no_surat_jalan].filter(Boolean).join(' · ') || '–'], ['Proyek tujuan', a.proyek_tujuan || '–']];
  return [['Kategori', a.kategori + (a.bab_kode ? ' · Bab ' + a.bab_kode : '')], ['Uraian', a.uraian], ['Nominal', rp(a.nominal)], ['Dibayar ke', a.dibayar_ke || '–']];
}
function idInput(a) { return a.progres_id || a.trx_id || a.biaya_id; }

export async function approval(p, q, tampilkan) {
  tampilkan({ judul: 'Approval', nav: '#/p/approval', isi: memuat() });
  const [antri, proyek] = await Promise.all([api('antrianApproval', {}), semuaProyek()]);
  lencana.menunggu = antri.length;
  const nama = {}; proyek.forEach((x) => { nama[x.proyek_id] = x; });
  let dipilih = antri[0] ? idInput(antri[0]) : null;
  const kartu = (a, lengkap) => html`<div class="kartu" id="k-${idInput(a)}">
    <div class="baris">${pill(labelTab(a._tab), 'info')}<span class="redup">${tgl(a.tanggal)} · ${a._umur_hari ? a._umur_hari + ' hari lalu' : 'hari ini'}</span></div>
    <div class="kolom"><b>${judulInput(a)}</b><span class="redup">${(nama[a.proyek_id] || {}).nama || a.proyek_id} · oleh ${a._input_nama}</span></div>
    ${a._media.length ? html`<div class="foto-baris">${a._media.map((m) => m.tipe === 'DOKUMEN' ? html`<button class="ph" data-lihat="${m.media_id}" style="border:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:12px;font-weight:600;color:#1F4E8C;cursor:pointer">${ikon('nota')}Dokumen</button>` : fotoKotak(m))}</div>` : html`<span class="pill warn">Tanpa foto/bukti</span>`}
    ${lengkap ? html`<div class="kv">${detailInput(a).map(([k, v]) => html`<span>${k}</span><span>${v}</span>`)}</div>` : html`<div class="kv">${detailInput(a).slice(0, 3).map(([k, v]) => html`<span>${k}</span><span>${v}</span>`)}</div>`}
    ${a._media.some((m) => m.lat) ? html`<span class="redup">GPS ${a._media.find((m) => m.lat).lat}, ${a._media.find((m) => m.lat).lng} · foto bercap waktu</span>` : ''}
    ${lengkap ? html`<div class="f"><label for="cat-${idInput(a)}">Catatan untuk admin lapangan (wajib jika ditolak)</label><textarea id="cat-${idInput(a)}"></textarea></div>` : ''}
    <div class="btn-baris"><button class="btn tolak" data-aksi="tolak" data-tab="${a._tab}" data-id="${idInput(a)}">Tolak</button><button class="btn" data-aksi="setujui" data-tab="${a._tab}" data-id="${idInput(a)}">Setujui</button></div></div>`;
  const gambar = () => {
    const cur = antri.find((a) => idInput(a) === dipilih) || antri[0];
    return html`<div class="hanya-hp" style="display:flex;flex-direction:column;gap:12px">${antri.map((a) => kartu(a, false))}</div>
      <div class="dua-panel hanya-lebar"><div class="kartu" style="padding:8px"><span class="redup tebal" style="padding:6px">SEMUA PROYEK · TERLAMA DULU</span>
        ${antri.map((a) => html`<button data-aksi="pilih" data-id="${idInput(a)}" style="text-align:left;border:0;background:${idInput(a) === (cur && idInput(cur)) ? '#EAF0F9' : 'transparent'};border-radius:10px;padding:10px;cursor:pointer;display:flex;flex-direction:column;gap:2px"><span class="kecil tebal">${judulInput(a)}</span><span class="redup">${labelTab(a._tab)} · ${(nama[a.proyek_id] || {}).kode || ''} · ${tgl(a.tanggal, false)}</span></button>`)}</div>
        <div class="panel-kanan">${cur ? kartu(cur, true) : ''}</div></div>`;
  };
  const sub = () => antri.length + ' input menunggu · data baru terlihat client setelah disetujui';
  tampilkan({
    judul: 'Approval', sub: sub(), nav: '#/p/approval',
    isi: antri.length ? gambar() : kosong('Tidak ada input yang menunggu. Semua sudah diperiksa.'),
    aksi: {
      pilih(el) { dipilih = el.dataset.id; isiUlang(gambar()); },
      async lihatBukti(el) {
        const tutup = modal(memuat('Mengambil berkas…'));
        try {
          const r = await api('mediaData', { media_id: el.dataset.id });
          tutup();
          modal(r.terlalu_besar ? html`<p>Berkas terlalu besar untuk ditampilkan. ${r.url ? html`<a href="${r.url}" target="_blank" rel="noopener">Buka di Drive</a>` : ''}</p><button class="btn garis" data-tutup>Tutup</button>`
            : /^image\//.test(r.mime) ? html`<img src="data:${r.mime};base64,${r.data_base64}" alt="Bukti" style="width:100%;border-radius:10px"><button class="btn garis" data-tutup>Tutup</button>`
              : html`<a class="btn" download="bukti" href="data:${r.mime};base64,${r.data_base64}">Unduh berkas</a><button class="btn garis" data-tutup>Tutup</button>`);
        } catch (e) { tutup(); toast(e.message, true); }
      },
      async setujui(el) { await putus(el, 'Disetujui', ''); },
      async tolak(el) {
        const ta = document.getElementById('cat-' + el.dataset.id);
        let cat = ta && ta.value.trim();
        if (!cat) {
          cat = await new Promise((ok) => modal(html`<h3 class="judul-seksi">Alasan penolakan</h3><form><div class="f"><label for="alasan">Catatan untuk admin lapangan</label><textarea id="alasan" required placeholder="mis. Foto kurang jelas, ambil ulang dari atas dengan meteran."></textarea></div><div class="btn-baris"><button type="button" class="btn garis" data-tutup>Batal</button><button class="btn tolak" type="submit">Tolak</button></div></form>`,
            (panel, tutup) => { panel.querySelector('form').onsubmit = (e) => { e.preventDefault(); const v = panel.querySelector('textarea').value.trim(); if (v) { tutup(); ok(v); } }; panel.querySelectorAll('[data-tutup]').forEach((b) => b.addEventListener('click', () => ok(null))); }));
        }
        if (cat) await putus(el, 'Ditolak', cat);
      },
    },
  });
  async function putus(el, keputusan, catatan) {
    const id = el.dataset.id, tab = el.dataset.tab, teksAwal = el.textContent;
    el.disabled = true; el.textContent = 'Menyimpan…';
    try {
      const ta = document.getElementById('cat-' + id);
      const r = await api('approve', { tab, id, keputusan, catatan: catatan || (ta && ta.value.trim()) || '' });
      if (!r[0].ok) throw new Error(r[0].pesan);
      toast(keputusan === 'Disetujui' ? 'Disetujui — angka dashboard & tampilan client diperbarui.' : 'Ditolak — dikembalikan ke admin dengan catatan.');
      const i = antri.findIndex((a) => idInput(a) === id); antri.splice(i, 1);
      lencana.menunggu = antri.length;
      dipilih = antri[i] ? idInput(antri[i]) : antri[0] ? idInput(antri[0]) : null;
      isiUlang(antri.length ? gambar() : kosong('Tidak ada input yang menunggu. Semua sudah diperiksa.'));
      const s = document.querySelector('.kepala-judul span'); if (s) s.textContent = sub();
    } catch (e) { toast(e.message, true); el.disabled = false; el.textContent = teksAwal; }
  }
}

// ======================================================================= RAB & CCO
export async function rabPilih(p, q, tampilkan) {
  tampilkan({ judul: 'RAB & CCO', nav: '#/p/rab', isi: memuat() });
  const proyek = await semuaProyek();
  tampilkan({
    judul: 'RAB & CCO', sub: 'Pilih proyek', nav: '#/p/rab',
    isi: proyek.length ? html`<div class="kartu"><div class="daftar">${proyek.map((x) => html`<a href="#/p/rab/${x.proyek_id}" class="baris" style="text-decoration:none;color:inherit;min-height:44px"><div class="kolom"><b class="kecil">${x.nama}</b><span class="redup">${x.kode} · ${x.client_nama || ''}</span></div>${ikon('kanan', 18)}</a>`)}</div></div>` : kosong('Belum ada proyek.'),
  });
}

export async function rab([pid], q, tampilkan) {
  const tab = q.tab || 'rekap';
  const tabs = [['rekap', 'Rekap bab'], ['item', 'Item'], ['cco', 'Riwayat CCO']].map(([k, l]) => ({ label: l, href: '#/p/rab/' + pid + '?tab=' + k, on: k === tab }));
  tampilkan({ judul: 'RAB & CCO', kembali: '#/p/rab', tabs, nav: '#/p/rab', isi: memuat() });
  const [p, items, cco] = await Promise.all([api('get', { tab: 'PROYEK', id: pid }), api('list', { tab: 'RAB_ITEM', proyek_id: pid }, { cache: true }), api('list', { tab: 'CCO', proyek_id: pid }, { cache: true })]);
  if (!items.length) return tampilkan({ judul: 'RAB & CCO', sub: p.nama, kembali: '#/p/rab', tabs, nav: '#/p/rab', isi: html`<div class="kartu kuning"><b>RAB belum diimport.</b><a class="btn" href="#/p/import/${pid}">Import RAB</a></div>` });
  const sup = (i) => i.supply_owner === true || String(i.supply_owner).toUpperCase() === 'TRUE';
  const kon = items.filter((i) => !sup(i));
  const K = kon.reduce((s, i) => s + Number(i.jumlah_kontrak || 0), 0), F = kon.reduce((s, i) => s + Number(i.jumlah_final || 0), 0);
  const oh = Number(p.overhead_pct) || 0;
  const babs = []; const per = {};
  kon.forEach((i) => { if (!per[i.bab_kode]) { per[i.bab_kode] = { kode: i.bab_kode, nama: i.bab_nama, k: 0, f: 0 }; babs.push(per[i.bab_kode]); } per[i.bab_kode].k += Number(i.jumlah_kontrak || 0); per[i.bab_kode].f += Number(i.jumlah_final || 0); });
  const jt = (n) => angka(n / 1e6, 2) + ' jt';
  const ringkas = html`<div class="kartu"><div class="grid3"><div class="st"><span class="redup">Kontrak</span><span class="nilai">${rpS(K * (1 + oh / 100))}</span></div><div class="st"><span class="redup">Final (CCO)</span><span class="nilai">${rpS(F * (1 + oh / 100))}</span></div><div class="st"><span class="redup">Perubahan</span><span class="nilai" style="color:${F >= K ? '#1C6B3C' : '#A3261B'}">${(F >= K ? '+' : '') + rpS((F - K) * (1 + oh / 100))}</span></div></div><span class="redup">Termasuk overhead ${oh}%. RAB kontrak terkunci; perubahan lewat CCO.</span></div>`;
  let isi;
  if (tab === 'rekap') {
    isi = html`${ringkas}<div class="tabel-wrap"><table><thead><tr><th>Bab</th><th class="angka">Kontrak</th><th class="angka">Final</th><th class="angka">Selisih</th></tr></thead><tbody>
      ${babs.map((b) => html`<tr><td>${b.kode}. ${b.nama}</td><td class="angka">${jt(b.k)}</td><td class="angka">${jt(b.f)}</td><td class="angka" style="color:${b.f - b.k > 0 ? '#1C6B3C' : b.f - b.k < 0 ? '#A3261B' : 'inherit'}">${Math.abs(b.f - b.k) < 1 ? '–' : (b.f > b.k ? '+' : '') + jt(b.f - b.k)}</td></tr>`)}
      <tr class="total"><td>Total sebelum overhead</td><td class="angka">${jt(K)}</td><td class="angka">${jt(F)}</td><td class="angka">${(F >= K ? '+' : '') + jt(F - K)}</td></tr>
      <tr class="total"><td>Overhead ${oh}%</td><td class="angka">${jt(K * oh / 100)}</td><td class="angka">${jt(F * oh / 100)}</td><td class="angka">${(F >= K ? '+' : '') + jt((F - K) * oh / 100)}</td></tr></tbody></table></div>
      ${items.some(sup) ? html`<div class="kartu"><span class="judul-kartu">Supply by owner (di luar bobot)</span><span class="kecil">${items.filter(sup).length} item · ${rp(items.filter(sup).reduce((s, i) => s + Number(i.jumlah_kontrak || 0), 0))}</span></div>` : ''}`;
  } else if (tab === 'item') {
    const cari = (q.cari || '').toLowerCase(), fb = q.bab || '';
    const tampak = kon.filter((i) => (!fb || i.bab_kode === fb) && (!cari || (i.uraian + ' ' + i.no_item + ' ' + (i.sub_grup || '')).toLowerCase().includes(cari)));
    isi = html`<form data-kirim="saring" class="grid2" style="gap:8px"><input type="search" name="cari" placeholder="Cari item" value="${q.cari || ''}" aria-label="Cari item"><select name="bab" aria-label="Filter bab" data-ubah="saringBab"><option value="">Semua bab</option>${babs.map((b) => html`<option value="${b.kode}" ${fb === b.kode ? 'selected' : ''}>Bab ${b.kode}</option>`)}</select></form>
      <button class="btn emas kecil" data-aksi="ccoBaru">${ikon('plus', 18)} CCO item pekerjaan baru</button>
      <div class="kartu" style="gap:0">${tampak.slice(0, 200).map((i) => html`<button data-aksi="cco" data-id="${i.item_id}" style="text-align:left;border:0;border-top:1px solid #EEF1F6;background:none;padding:10px 0;cursor:pointer;display:flex;flex-direction:column;gap:4px;width:100%">
        <span class="baris"><span class="kecil tebal">${i.bab_kode}.${i.no_item} ${i.uraian}</span>${pill(i.status_cco, { Tetap: 'info', Tambah: 'ok', Kurang: 'bad', Baru: 'warn' }[i.status_cco])}</span>
        <span class="redup">${i.sub_grup ? i.sub_grup + ' · ' : ''}Kontrak ${angka(i.vol_kontrak, 2)} ${i.satuan} × ${rp(i.harga_kontrak)} = ${rp(i.jumlah_kontrak)}${i.status_cco !== 'Tetap' ? ' → final ' + angka(i.vol_final, 2) + ' × ' + rp(i.harga_final) + ' = ' + rp(i.jumlah_final) : ''} · bobot ${pct(i.bobot_pct, 3)}</span></button>`)}
        ${tampak.length > 200 ? html`<span class="redup">Menampilkan 200 dari ${tampak.length}. Persempit pencarian.</span>` : ''}${!tampak.length ? kosong('Tidak ada item cocok.') : ''}</div>
      <span class="redup">RAB kontrak terkunci. Ketuk item untuk mengusulkan perubahan lewat CCO.</span>`;
  } else {
    const nm = {}; items.forEach((i) => { nm[i.item_id] = i; });
    const grup = {}; cco.forEach((c) => { (grup[c.no_cco] = grup[c.no_cco] || []).push(c); });
    isi = html`${ringkas}${Object.keys(grup).length ? Object.keys(grup).map((k) => { const g = grup[k], tbh = g.filter((c) => c.selisih_nilai > 0).reduce((s, c) => s + Number(c.selisih_nilai), 0), krg = g.filter((c) => c.selisih_nilai < 0).reduce((s, c) => s + Number(c.selisih_nilai), 0); return html`<div class="kartu"><div class="baris"><b>${k}</b>${pill(g.every((c) => c.disetujui_client === true || String(c.disetujui_client).toUpperCase() === 'TRUE') ? 'Disetujui client' : 'Belum ditandai disetujui client', g.every((c) => c.disetujui_client === true || String(c.disetujui_client).toUpperCase() === 'TRUE') ? 'ok' : 'warn')}</div>
        <span class="redup">${tgl(g[0].tanggal)} · ${g.length} item${g[0].dokumen_url ? html` · <a href="${g[0].dokumen_url}" target="_blank" rel="noopener">dokumen</a>` : ''}</span>
        <div class="grid3"><div class="st"><span class="redup">Kerja tambah</span><span class="nilai" style="font-size:14px">+${rpS(tbh)}</span></div><div class="st"><span class="redup">Kerja kurang</span><span class="nilai" style="font-size:14px">${rpS(krg)}</span></div><div class="st"><span class="redup">Bersih</span><span class="nilai" style="font-size:14px">${(tbh + krg >= 0 ? '+' : '') + rpS(tbh + krg)}</span></div></div>
        <details><summary class="kecil tebal" style="cursor:pointer;min-height:32px">Rincian item</summary><div class="daftar">${g.map((c) => html`<div class="kolom"><span class="kecil">${(nm[c.item_id] || {}).uraian || c.item_id}</span><span class="redup">${c.jenis} · vol ${angka(c.vol_lama, 2)} → ${angka(c.vol_baru, 2)} · ${(c.selisih_nilai > 0 ? '+' : '') + rp(c.selisih_nilai)} · ${c.alasan}</span></div>`)}</div></details></div>`; }) : kosong('Belum ada CCO.')}
      <div class="kartu"><span class="judul-kartu">Alur CCO baru</span><span class="kecil">1. Pilih item (tab Item) → isi volume/harga baru + alasan · 2. Lampirkan link berita acara · 3. Tandai disetujui client · 4. RAB final & bobot diperbarui otomatis, kontrak tetap.</span></div>`;
  }
  const formCco = (i) => html`<h3 class="judul-seksi">${i ? 'CCO: ' + i.uraian : 'CCO item pekerjaan baru'}</h3>
    ${i ? html`<span class="redup">Kontrak ${angka(i.vol_kontrak, 2)} ${i.satuan} × ${rp(i.harga_kontrak)} · final sekarang ${angka(i.vol_final, 2)} × ${rp(i.harga_final)} = ${rp(i.jumlah_final)}</span>` : ''}
    <form id="f-cco">
      ${i ? html`<div class="f"><span class="lbl">Jenis</span><div class="chips"><label><input type="radio" name="jenis" value="Tambah" checked><span>Kerja tambah</span></label><label><input type="radio" name="jenis" value="Kurang"><span>Kerja kurang</span></label></div></div>`
        : html`<input type="hidden" name="jenis" value="Baru"><div class="f"><label for="cu">Uraian pekerjaan</label><input id="cu" name="uraian" required></div>
        <div class="grid2"><div class="f"><label for="cs">Satuan</label><input id="cs" name="satuan" required></div><div class="f"><label for="cb">Bab</label><select id="cb" name="bab_kode">${babs.map((b) => html`<option value="${b.kode}">${b.kode}. ${b.nama}</option>`)}<option value="CCO">Bab baru: Pekerjaan tambah (CCO)</option></select></div></div>
        <div class="f"><span class="lbl">Cara ukur</span><div class="chips"><label><input type="radio" name="cara_ukur" value="volume" checked><span>Volume</span></label><label><input type="radio" name="cara_ukur" value="persen"><span>Persen (lumpsum)</span></label></div></div>`}
      <div class="grid2"><div class="f"><label for="cv">Volume baru</label><input id="cv" name="vol_baru" type="number" step="any" min="0" required value="${i ? i.vol_final : ''}"></div><div class="f"><label for="ch">Harga satuan (Rp)</label><input id="ch" name="harga" type="number" step="any" min="0" ${i ? '' : 'required'} value="${i ? i.harga_final || i.harga_kontrak : ''}"></div></div>
      <div class="f"><label for="ca">Alasan / dasar perubahan</label><textarea id="ca" name="alasan" required></textarea></div>
      <div class="grid2"><div class="f"><label for="cn">No. CCO</label><input id="cn" name="no_cco" placeholder="otomatis"></div><div class="f"><label for="cd">Link berita acara (Drive)</label><input id="cd" name="dokumen_url" type="text" inputmode="url"></div></div>
      <label class="cek"><input type="checkbox" name="disetujui_client"><span>Sudah disetujui client</span></label>
      <div class="btn-baris"><button type="button" class="btn garis" data-tutup>Batal</button><button class="btn" type="submit">Simpan CCO</button></div></form>`;
  const kirimCco = (i) => (panel, tutup) => {
    panel.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const d = dataForm(e.target), data = { proyek_id: pid, jenis: d.jenis, vol_baru: d.vol_baru, harga: d.harga, alasan: d.alasan, no_cco: d.no_cco, dokumen_url: d.dokumen_url, disetujui_client: d.disetujui_client };
      if (i) data.item_id = i.item_id; else data.item_baru = { uraian: d.uraian, satuan: d.satuan, bab_kode: d.bab_kode, bab_nama: (babs.find((b) => b.kode === d.bab_kode) || {}).nama, cara_ukur: d.cara_ukur };
      try { await api('buatCco', data); tutup(); toast('CCO tersimpan. RAB final & bobot diperbarui.'); pergi('#/p/rab/' + pid + '?tab=cco'); } catch (er) { toast(er.message, true); }
    };
  };
  tampilkan({
    judul: 'RAB & CCO — ' + p.kode, sub: p.nama + (p.client_nama ? ' · ' + p.client_nama : ''), kembali: '#/p/rab', tabs, nav: '#/p/rab', isi,
    aksi: {
      saring(f) { const d = dataForm(f); pergi('#/p/rab/' + pid + '?tab=item&cari=' + encodeURIComponent(d.cari || '') + '&bab=' + encodeURIComponent(d.bab || '')); },
      saringBab(el) { this.saring(el.form); },
      cco(el) { const i = items.find((x) => x.item_id === el.dataset.id); modal(formCco(i), kirimCco(i)); },
      ccoBaru() { modal(formCco(null), kirimCco(null)); },
    },
  });
}

// ======================================================================= pengguna
export async function pengguna(p, q, tampilkan) {
  tampilkan({ judul: 'Pengguna', nav: '#/p/pengguna', isi: memuat() });
  const [users, proyek] = await Promise.all([api('userList', {}), semuaProyek()]);
  const filter = q.f || '';
  const nmP = {}; proyek.forEach((x) => { nmP[x.proyek_id] = x.kode; });
  const tampak = users.filter((u) => !filter || u.peran === filter);
  const formUser = (u) => html`<h3 class="judul-seksi">${u ? 'Ubah ' + u.nama : 'Tambah pengguna'}</h3><form>
    ${u ? '' : html`<div class="f"><label for="un">Nama</label><input id="un" name="nama" required></div><div class="f"><label for="ue">Email</label><input id="ue" name="email" type="email" required></div><div class="f"><label for="uh">No. HP</label><input id="uh" name="no_hp" type="tel"></div>`}
    <div class="f"><span class="lbl">Peran</span><div class="chips">${['ADMIN', 'PENGELOLA', 'CLIENT'].map((r) => html`<label><input type="radio" name="peran" value="${r}" ${(u ? u.peran : 'ADMIN') === r ? 'checked' : ''}><span>${{ ADMIN: 'Admin lapangan', PENGELOLA: 'Pengelola', CLIENT: 'Client' }[r]}</span></label>`)}</div></div>
    <div class="f"><span class="lbl">Proyek (untuk admin & client)</span><div class="chips">${proyek.map((x) => html`<label><input type="checkbox" name="proyek" value="${x.proyek_id}" ${u && String(u.proyek_akses).split(',').includes(x.proyek_id) ? 'checked' : ''}><span>${x.kode}</span></label>`)}</div></div>
    ${u ? '' : html`<label class="cek"><input type="checkbox" name="kirim_email" checked><span>Kirim password sementara ke email pengguna</span></label>`}
    <div class="btn-baris"><button type="button" class="btn garis" data-tutup>Batal</button><button class="btn" type="submit">${u ? 'Simpan' : 'Tambah'}</button></div></form>`;
  tampilkan({
    judul: 'Pengguna', sub: users.length + ' akun · kapasitas nyaman ±15 orang', nav: '#/p/pengguna',
    kanan: html`<button class="ikon-btn" data-aksi="tambah" aria-label="Tambah pengguna">${ikon('plus')}</button>`,
    isi: html`<div class="pills">${[['', 'Semua'], ['PENGELOLA', 'Pengelola'], ['ADMIN', 'Admin lapangan'], ['CLIENT', 'Client']].map(([k, l]) => html`<a class="pill ${filter === k ? 'ok' : 'info'}" href="#/p/pengguna${k ? '?f=' + k : ''}" style="min-height:32px">${l}</a>`)}</div>
      <button class="btn emas kecil" data-aksi="tambah">${ikon('plus', 18)} Tambah pengguna</button>
      <div class="kartu" style="gap:0">${tampak.map((u) => html`<div class="baris" style="border-top:1px solid #EEF1F6;padding:10px 0;align-items:flex-start">
        <span style="width:40px;height:40px;border-radius:50%;background:${u.aktif === false ? '#E6EAF2' : '#EAF0F9'};color:#1F4E8C;display:flex;align-items:center;justify-content:center;font-weight:700;flex:none">${u.nama.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()}</span>
        <div class="kolom" style="flex:1"><b class="kecil">${u.nama}</b><span class="redup">${u.email}</span><span class="redup">${u.peran === 'PENGELOLA' ? 'Semua proyek' : String(u.proyek_akses || '').split(',').filter(Boolean).map((x) => nmP[x] || x).join(', ') || 'belum ada proyek'} · ${u.login_terakhir ? 'login ' + tgl(u.login_terakhir) : 'belum pernah login'}</span>
          <div class="pills" style="margin-top:4px"><button class="link-btn" data-aksi="ubah" data-id="${u.user_id}">Ubah</button><button class="link-btn" data-aksi="reset" data-id="${u.user_id}">Reset password</button><button class="link-btn" data-aksi="aktif" data-id="${u.user_id}" data-aktif="${u.aktif === false ? '1' : '0'}">${u.aktif === false ? 'Aktifkan' : 'Nonaktifkan'}</button></div></div>
        ${pill(u.aktif === false ? 'Nonaktif' : { ADMIN: 'Admin', PENGELOLA: 'Pengelola', CLIENT: 'Client' }[u.peran], u.aktif === false ? 'bad' : 'info')}</div>`)}</div>
      <span class="redup">Login memakai email & kata sandi aplikasi. Pengguna nonaktif tidak bisa masuk, tetapi riwayat inputnya tetap tersimpan.</span>`,
    aksi: {
      tambah() {
        modal(formUser(null), (panel, tutup) => {
          panel.querySelector('form').onsubmit = async (e) => {
            e.preventDefault(); const d = dataForm(e.target);
            try {
              const r = await api('userCreate', { nama: d.nama, email: d.email, no_hp: d.no_hp, peran: d.peran, proyek_akses: [].concat(d.proyek || []).join(','), kirim_email: d.kirim_email });
              tutup();
              if (r.password_sementara) modal(html`<h3 class="judul-seksi">Akun dibuat</h3><p>Berikan password sementara ini ke ${d.nama} (ditampilkan sekali):</p><p style="font-size:20px;font-weight:700;font-family:monospace;background:#F4F6FA;padding:12px;border-radius:10px;text-align:center">${r.password_sementara}</p><button class="btn" data-tutup>Selesai</button>`);
              else toast('Akun dibuat, password dikirim ke ' + d.email);
              pergi(location.hash);
            } catch (er) { toast(er.message, true); }
          };
        });
      },
      ubah(el) {
        const u = users.find((x) => x.user_id === el.dataset.id);
        modal(formUser(u), (panel, tutup) => {
          panel.querySelector('form').onsubmit = async (e) => { e.preventDefault(); const d = dataForm(e.target); try { await api('userUpdate', { user_id: u.user_id, peran: d.peran, proyek_akses: [].concat(d.proyek || []).join(',') }); tutup(); toast('Disimpan.'); pergi(location.hash); } catch (er) { toast(er.message, true); } };
        });
      },
      async reset(el) {
        const u = users.find((x) => x.user_id === el.dataset.id);
        if (!(await konfirmasi('Reset password ' + u.nama + '?', 'Password lama tidak berlaku lagi. Password sementara dikirim ke ' + u.email + '.', 'Reset & kirim email'))) return;
        try { await api('userResetPassword', { user_id: u.user_id, kirim_email: true }); toast('Password sementara dikirim ke ' + u.email); } catch (e) { toast(e.message, true); }
      },
      async aktif(el) { try { await api('userUpdate', { user_id: el.dataset.id, aktif: el.dataset.aktif === '1' }); pergi(location.hash); } catch (e) { toast(e.message, true); } },
    },
  });
}

// ======================================================================= laporan
export async function laporan(p, q, tampilkan) {
  tampilkan({ judul: 'Laporan bulanan', nav: '#/p/laporan', isi: memuat() });
  const [proyek, lap] = await Promise.all([semuaProyek(), api('list', { tab: 'LAPORAN' })]);
  const nm = {}; proyek.forEach((x) => { nm[x.proyek_id] = x; });
  const aktif = proyek.filter((x) => x.tgl_mulai && x.status !== 'Selesai');
  const pid = q.p || (aktif[0] || {}).proyek_id;
  const per = pid ? await api('periodeLaporan', { proyek_id: pid }).catch(() => ({ periode: [] })) : { periode: [] };
  const hariIni_ = hariIni();
  const p0 = nm[pid] || {};
  tampilkan({
    judul: 'Laporan bulanan', sub: 'PDF otomatis + email ke client (cc pengelola)', nav: '#/p/laporan',
    isi: html`<div class="kartu"><div class="f"><label for="lp">Proyek</label><select id="lp" data-ubah="gantiP">${aktif.map((x) => html`<option value="${x.proyek_id}" ${x.proyek_id === pid ? 'selected' : ''}>${x.nama}</option>`)}</select></div>
        ${pid ? html`<div class="kv"><span>Kepada</span><span>${p0.client_email || html`<b style="color:#A3261B">email client belum diisi</b> — isi di Ubah data proyek`}</span><span>CC</span><span>semua pengelola aktif</span><span>Jadwal</span><span>Periode mulai tanggal ${per.hari || '–'} tiap bulan · dikirim otomatis H+1 pukul 07.00</span></div>` : ''}</div>
      ${pid ? html`<div class="kartu"><span class="judul-kartu">Periode</span><div class="daftar">${per.periode.map(([a, b], i) => { const l = lap.find((x) => x.proyek_id === pid && String(x.periode_akhir).slice(0, 10) === b); const lewat = b < hariIni_; return html`<div class="baris"><div class="kolom"><b class="kecil">#${i + 1} · ${tgl(a)} – ${tgl(b)}</b><span class="redup">${l ? (l.tgl_kirim ? 'Terkirim ' + tgl(l.tgl_kirim) + ' ke ' + l.dikirim_ke : 'PDF dibuat, belum dikirim') + ' · realisasi ' + pct(l.prestasi_realisasi, 3) : lewat ? 'Belum dibuat' : 'Berjalan — dikirim otomatis ' + tgl(tambahHari(b, 1))}</span></div>
          <span class="pills">${l ? html`<button class="btn garis kecil" data-aksi="unduh" data-id="${l.laporan_id}">${ikon('unduh', 16)} PDF</button>` : ''}${lewat || !l ? html`<button class="btn garis kecil" data-aksi="buat" data-a="${a}" data-b="${lewat ? b : hariIni_}">${l ? 'Buat ulang' : lewat ? 'Buat PDF' : 'Pratinjau s/d hari ini'}</button>` : ''}${l && !l.tgl_kirim && lewat ? html`<button class="btn kecil" data-aksi="kirim" data-a="${a}" data-b="${b}">Kirim</button>` : ''}</span></div>`; })}</div>
        <span class="redup">Isi otomatis dari data yang sudah disetujui: cover, laporan umum, rekap per bab, detail per item, Kurva S, termin, dokumentasi foto, tanda tangan. Biaya aktual & harga beli tidak pernah masuk laporan client.</span></div>` : kosong('Belum ada proyek berjalan.')}
      <div class="kartu"><span class="judul-kartu">Logo kop laporan</span><label class="btn garis kecil" style="position:relative">Ganti logo (PNG/JPG)<input type="file" accept="image/png,image/jpeg" data-ubah="logo" style="position:absolute;opacity:0;width:1px"></label></div>`,
    aksi: {
      gantiP(el) { pergi('#/p/laporan?p=' + el.value); },
      async buat(el) { await proses(el, false); },
      async kirim(el) { if (await konfirmasi('Kirim laporan ke client?', 'PDF dikirim ke ' + (p0.client_email || 'pengelola') + ' (cc pengelola).', 'Kirim')) await proses(el, true); },
      async unduh(el) {
        const t = el.textContent; el.disabled = true; el.textContent = 'Mengunduh…';
        try { const r = await api('unduhLaporan', { laporan_id: el.dataset.id }); unduhBerkas(r.nama, r.mime, r.data_base64); } catch (e) { toast(e.message, true); }
        el.disabled = false; el.textContent = t;
      },
      async logo(el) {
        const f = el.files[0]; if (!f) return;
        try { await api('unggahLogo', { mime: f.type, data_base64: await berkasKeBase64(f) }); toast('Logo kop diperbarui.'); } catch (e) { toast(e.message, true); }
      },
    },
  });
  async function proses(el, kirim) {
    const t = el.textContent; el.disabled = true; el.textContent = kirim ? 'Membuat & mengirim…' : 'Membuat PDF…';
    try {
      const r = await api('buatLaporan', { proyek_id: pid, periode_awal: el.dataset.a, periode_akhir: el.dataset.b, kirim });
      toast(kirim ? 'Laporan terkirim ke ' + r.dikirim_ke : 'PDF dibuat · realisasi ' + pct(r.prestasi_realisasi, 3));
      pergi('#/p/laporan?p=' + pid + '&t=' + Date.now());
    } catch (e) { toast(e.message, true); el.disabled = false; el.textContent = t; }
  }
}
void raw; void jam; void tglPanjang;
