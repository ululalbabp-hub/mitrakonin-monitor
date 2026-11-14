/*
 * Layar client: hanya data yang sudah Disetujui. Server sudah menyaring kolom & baris
 * (tanpa biaya, harga beli, stok, risiko); layar ini tidak meminta data internal apa pun.
 */
import { html, api, foto as fotoKotak, unduhBerkas, toast, sesi, memuat, kosong, pill, bar, kurvaS, LS, rp, rpS, pct, angka, tgl, hariIni, selisihHari, statusKelas, pergi } from '../inti.js';

export async function progres([pidParam], q, tampilkan) {
  const u = sesi.user();
  const tab = q.tab || 'progres';
  tampilkan({ judul: 'Selamat datang', sub: u.nama, nav: '#/c', isi: memuat() });
  const ids = u.proyek || [];
  if (!ids.length) return tampilkan({ judul: 'Selamat datang', sub: u.nama, nav: '#/c', isi: kosong('Belum ada proyek yang terhubung ke akun Anda.') });
  const pid = pidParam || (ids.includes(LS.get('mk_proyek_c')) ? LS.get('mk_proyek_c') : ids[0]);
  const [daftar, h, media, lap] = await Promise.all([
    ids.length > 1 ? api('list', { tab: 'PROYEK' }, { cache: true }).catch(() => []) : [],
    api('dashboardProyek', { proyek_id: pid }, { cache: true }),
    api('list', { tab: 'MEDIA', proyek_id: pid }, { cache: true }).catch(() => []),
    api('list', { tab: 'LAPORAN', proyek_id: pid }, { cache: true }).catch(() => []),
  ]);
  const p = h.proyek, r = h.ringkas;
  const sisa = p.tgl_selesai_rencana ? selisihHari(hariIni(), p.tgl_selesai_rencana) : null;
  const foto = media.filter((m) => m.tipe === 'FOTO').sort((a, b) => String(b.waktu_ambil).localeCompare(String(a.waktu_ambil)));
  const video = media.filter((m) => m.tipe === 'VIDEO');
  const fotoPer = {}; media.forEach((m) => { (fotoPer[m.ref_id] = fotoPer[m.ref_id] || []).push(m); });
  const base = pidParam ? '#/c/' + pid : '#/c';
  const tabs = [['progres', 'Progres'], ['foto', 'Foto'], ['termin', 'Termin'], ['laporan', 'Laporan']].map(([k, l]) => ({ label: l, href: base + '?tab=' + k, on: k === tab }));
  const pemilih = daftar.length > 1 ? html`<div class="f"><label for="pp">Proyek</label><select id="pp" data-ubah="ganti">${daftar.map((x) => html`<option value="${x.proyek_id}" ${x.proyek_id === pid ? 'selected' : ''}>${x.nama} (${x.kode})</option>`)}</select></div>` : '';
  const hero = html`<div class="kartu" style="background:#0B2149;color:#fff;border-color:#0B2149">
    <span style="font-size:12px;color:#C9D4E8">${p.nama}${p.lokasi ? ' · ' + p.lokasi : ''}</span>
    <div class="baris" style="align-items:flex-end"><span class="h" style="font-size:36px;line-height:1">${pct(r.realisasi_pct)}</span><span style="font-size:12px;color:#C9D4E8;text-align:right">selesai${r.ada_jadwal ? html`<br>rencana ${pct(r.rencana_pct)}` : ''}</span></div>
    ${bar(r.realisasi_pct, r.rencana_pct)}
    <span style="font-size:12px;color:#C9D4E8">Diperbarui ${r.laporan_terakhir ? tgl(r.laporan_terakhir) : '–'}${sisa !== null && sisa >= 0 ? ' · sisa waktu ' + sisa + ' hari' : ''}</span></div>`;
  const panelProgres = html`<div class="kartu"><span class="judul-kartu">Per tahap pekerjaan</span>
      ${h.per_bab.map((b) => html`<div class="kolom" style="gap:4px"><div class="baris"><span class="kecil tebal">${b.bab_nama}</span><b class="kecil">${pct(b.progres_bab_pct, 0)}</b></div>${bar(b.progres_bab_pct)}</div>`)}</div>
    ${r.ada_jadwal ? html`<div class="kartu"><div class="baris"><span class="judul-kartu">Kurva S</span><span class="redup">━ Realisasi ┅ Rencana</span></div>${kurvaS(h.kurva_s, p.tgl_mulai)}</div>` : ''}
    <div class="kartu"><span class="judul-kartu">Kegiatan terbaru</span>${h.linimasa.length ? html`<div class="daftar">${h.linimasa.map((x) => html`<div style="display:flex;gap:10px;align-items:flex-start"><span class="titik" style="background:#1F4E8C"></span><div class="kolom"><span class="kecil tebal">${x.uraian_kegiatan || x.uraian_item}</span><span class="redup">${tgl(x.tanggal)} · ${x.uraian_item}${(fotoPer[x.progres_id] || []).length ? ' · ' + fotoPer[x.progres_id].length + ' foto' : ''}</span></div></div>`)}</div>` : kosong('Belum ada kegiatan yang disetujui.')}</div>`;
  const panelFoto = foto.length || video.length ? html`<div class="galeri">${foto.concat(video).map((m) => fotoKotak(m))}</div>
      ` : kosong('Foto tampil di sini setelah laporan lapangan disetujui.');
  const dibayar = h.termin.reduce((s, t) => s + (Number(t.nominal_diterima) || 0), 0);
  const panelTermin = html`<div class="grid2"><div class="kpi"><div class="redup">Nilai kontrak</div><div class="nilai">${rpS(r.nilai_kontrak)}</div></div><div class="kpi"><div class="redup">Sudah dibayar</div><div class="nilai">${rpS(dibayar)}</div></div></div>
    <div class="kartu">${h.termin.length ? html`<div class="daftar">${h.termin.map((t) => html`<div class="baris"><div class="kolom"><b class="kecil">Termin ${t.termin_ke} — ${pct(t.persen_nilai, 0)}</b><span class="redup">${t.status === 'Lunas' ? 'dibayar ' + tgl(t.tgl_bayar) : t.status === 'Ditagih' ? 'ditagih ' + tgl(t.tgl_tagih) : t.syarat_progres_pct ? 'saat progres mencapai ' + pct(t.syarat_progres_pct, 0) : 'sesuai kontrak'}</span></div><div class="kolom" style="align-items:flex-end"><b class="kecil">${rp(t.nominal)}</b>${pill(t.status, statusKelas(t.status))}</div></div>`)}</div>` : kosong('Jadwal termin belum diisi.')}</div>`;
  const panelLaporan = html`<div class="kartu">${lap.length ? html`<div class="daftar">${lap.slice().reverse().map((l) => html`<div class="baris"><div class="kolom"><b class="kecil">Laporan progres ${tgl(l.periode_awal)} – ${tgl(l.periode_akhir)}</b><span class="redup">prestasi ${pct(l.prestasi_realisasi, 3)}${l.tgl_kirim ? ' · dikirim ' + tgl(l.tgl_kirim) : ''}</span></div>${l.pdf_url ? html`<button class="btn garis kecil" data-aksi="unduh" data-id="${l.laporan_id}">Unduh PDF</button>` : ''}</div>`)}</div>` : kosong('Laporan bulanan (PDF) tersedia di sini dan dikirim ke email Anda setiap periode.')}</div>`;
  const isiTab = { progres: panelProgres, foto: panelFoto, termin: panelTermin, laporan: panelLaporan }[tab];
  tampilkan({
    judul: 'Selamat datang', sub: u.nama, nav: '#/c', tabs,
    isi: html`${pemilih}<div class="dua-panel"><div style="display:flex;flex-direction:column;gap:12px">${hero}<div class="hanya-lebar">${tab === 'progres' ? panelTermin : ''}</div></div>
      <div style="display:flex;flex-direction:column;gap:12px">${isiTab}${tab === 'progres' && foto.length ? html`<div class="kartu hanya-lebar"><div class="baris"><span class="judul-kartu">Foto terbaru</span><a class="kecil tebal" href="${base}?tab=foto">Semua foto</a></div><div class="galeri">${foto.slice(0, 8).map((m) => fotoKotak(m))}</div></div>` : ''}</div></div>
      <span class="redup" style="text-align:center">Data yang tampil sudah diperiksa pengelola MITRAKONIN.</span>`,
    aksi: {
      async unduh(el) { const t = el.textContent; el.disabled = true; el.textContent = 'Mengunduh…'; try { const r = await api('unduhLaporan', { laporan_id: el.dataset.id }); unduhBerkas(r.nama, r.mime, r.data_base64); } catch (e) { toast(e.message, true); } el.disabled = false; el.textContent = t; },
      ganti(el) { LS.set('mk_proyek_c', el.value); pergi('#/c/' + el.value); } },
  });
}
void angka;
