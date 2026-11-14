import {
  html, api, sesi, toast, memuat, kosong, pill, bar, ikon, dataForm, isiUlang, antrian, ambilLokasi, siapkanFoto, siapkanVideo, LS,
  rp, pct, angka, tgl, jam, tglPanjang, hariIni, sekarangIso, selisihHari, statusKelas, warnaKelas, pergi, konfirmasi,
} from '../inti.js';
import { konfigurasi, pilihanSheet } from './umum.js';

// ---------------------------------------------------------------- proyek aktif
async function proyekSaya() {
  const list = await api('list', { tab: 'PROYEK' }, { cache: true });
  return list.filter((p) => p.status !== 'Selesai');
}
function pilihProyek(list) {
  const simpan = LS.get('mk_proyek');
  return list.find((p) => p.proyek_id === simpan) || list[0] || null;
}
function pemilihProyek(list, aktif) {
  if (list.length < 2) return '';
  return html`<div class="f"><label for="pilih-proyek">Proyek</label><select id="pilih-proyek" data-ubah="gantiProyek">${list.map((p) => html`<option value="${p.proyek_id}" ${p.proyek_id === aktif.proyek_id ? 'selected' : ''}>${p.nama}</option>`)}</select></div>`;
}
const aksiGantiProyek = { gantiProyek(el) { LS.set('mk_proyek', el.value); pergi(location.hash); } };
const tanpaProyek = (tampilkan, judul) => tampilkan({ judul, isi: kosong('Anda belum ditugaskan ke proyek mana pun. Hubungi pengelola.') });

// ---------------------------------------------------------------- media (foto/video) untuk form
function pengelolaMedia({ wadahId, keterangan, minFoto = 0, video = false }) {
  const m = { daftar: [], wadahId, keterangan, minFoto, video, lokasi: null };
  m.gambar = () => {
    const el = document.getElementById(wadahId); if (!el) return;
    el.innerHTML = html`<div class="unggah">
      ${m.daftar.map((x, i) => html`<div class="item">${x.tipe === 'VIDEO' ? html`<video src="${x.url}" muted playsinline></video>` : html`<img src="${x.url}" alt="Foto ${i + 1}">`}
        <button type="button" data-aksi="hapusMedia" data-i="${i}" aria-label="Hapus">${ikon('x', 16)}</button><small>${x.tipe === 'VIDEO' ? Math.round(x.durasi || 0) + ' dtk · ' : ''}${x.kb} KB · ${jam(x.waktu_ambil)}</small></div>`)}
      <label class="tambah">${ikon('kamera')}Ambil foto<input type="file" accept="image/*" capture="environment" multiple data-ubah="tambahFoto"></label>
      ${video ? html`<label class="tambah">${ikon('video')}Video ≤ ${m.batasVideo || 60} dtk<input type="file" accept="video/*" capture="environment" data-ubah="tambahVideo"></label>` : ''}
    </div><span class="redup">${m.lokasi ? 'GPS ' + m.lokasi.lat + ', ' + m.lokasi.lng : m.gpsSelesai ? 'GPS tidak tersedia — izinkan akses lokasi di browser' : 'Mencari lokasi GPS…'} · cap waktu otomatis. Foto dikompres ±${m.maksKb || 300} KB.</span>`.s;
  };
  m.aksi = {
    hapusMedia(el) { const x = m.daftar.splice(Number(el.dataset.i), 1)[0]; if (x) URL.revokeObjectURL(x.url); m.gambar(); },
    async tambahFoto(el) {
      const files = [...el.files]; if (!files.length) return;
      toast('Memproses ' + files.length + ' foto…');
      m.lokasi = m.lokasi || (await ambilLokasi());
      for (const f of files) {
        try {
          const r = await siapkanFoto(f, { maksKb: m.maksKb || 300, keterangan: typeof keterangan === 'function' ? keterangan() : keterangan, lokasi: m.lokasi });
          m.daftar.push(Object.assign(r, { tipe: 'FOTO', nama_file: 'foto.jpg', waktu_ambil: sekarangIso(), lat: m.lokasi ? m.lokasi.lat : '', lng: m.lokasi ? m.lokasi.lng : '' }));
        } catch (e) { toast('Foto gagal diproses: ' + e.message, true); }
      }
      m.gambar();
    },
    async tambahVideo(el) {
      const f = el.files[0]; if (!f) return;
      try {
        m.lokasi = m.lokasi || (await ambilLokasi());
        const r = await siapkanVideo(f, m.batasVideo || 60);
        m.daftar.push(Object.assign(r, { tipe: 'VIDEO', nama_file: f.name || 'video.mp4', waktu_ambil: sekarangIso(), lat: m.lokasi ? m.lokasi.lat : '', lng: m.lokasi ? m.lokasi.lng : '' }));
        m.gambar();
      } catch (e) { toast(e.message, true); }
      el.value = '';
    },
  };
  m.cek = () => { const n = m.daftar.filter((x) => x.tipe === 'FOTO').length; if (n < minFoto) throw new Error('Tambahkan minimal ' + minFoto + ' foto bukti.'); };
  m.untukKirim = () => m.daftar.map((x) => ({ tipe: x.tipe, mime: x.mime, nama_file: x.nama_file, data_base64: x.base64, lat: x.lat, lng: x.lng, waktu_ambil: x.waktu_ambil }));
  ambilLokasi().then((l) => { m.lokasi = l; m.gpsSelesai = true; m.gambar(); });
  return m;
}
async function batasMedia(m) { try { const c = await konfigurasi(); m.maksKb = Number(c.foto_maks_kb) || 300; m.batasVideo = Number(c.batas_ukuran_video_detik) || 60; } catch (e) { /* default */ } }

// ---------------------------------------------------------------- beranda
export async function beranda(p, q, tampilkan) {
  const u = sesi.user();
  tampilkan({ judul: 'Halo, ' + u.nama.split(' ')[0], sub: 'Admin lapangan · ' + tglPanjang(), nav: '#/a', isi: memuat() });
  const list = await proyekSaya();
  const pr = pilihProyek(list);
  if (!pr) return tanpaProyek(tampilkan, 'Beranda');
  const [h, prg, mtx, bya, nAntri] = await Promise.all([
    api('dashboardProyek', { proyek_id: pr.proyek_id }, { cache: true }).catch(() => null),
    api('list', { tab: 'PROGRES', proyek_id: pr.proyek_id, where: { input_oleh: u.user_id } }, { cache: true }).catch(() => []),
    api('list', { tab: 'MATERIAL_TRX', proyek_id: pr.proyek_id, where: { input_oleh: u.user_id } }, { cache: true }).catch(() => []),
    api('list', { tab: 'BIAYA', proyek_id: pr.proyek_id, where: { input_oleh: u.user_id } }, { cache: true }).catch(() => []),
    antrian.jumlah(),
  ]);
  const item = {}; (h ? h.progres_item : []).forEach((i) => { item[i.item_id] = i; });
  const semua = [].concat(
    prg.map((x) => ({ jenis: 'progres', judul: (item[x.item_id] || {}).uraian || x.item_id, ket: x.persen_kumulatif !== '' ? pct(x.persen_kumulatif, 0) : '+' + angka(x.volume_hari_ini, 2) + ' ' + ((item[x.item_id] || {}).satuan || ''), tanggal: x.tanggal, status: x.status, catatan: x.catatan_approve })),
    mtx.map((x) => ({ jenis: 'material ' + String(x.jenis).toLowerCase(), judul: x.kode_material + ' · ' + angka(x.qty, 2), tanggal: x.tanggal, status: x.status })),
    bya.map((x) => ({ jenis: 'biaya', judul: x.uraian, ket: rp(x.nominal), tanggal: x.tanggal, status: x.status })),
  ).sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)));
  const ditolak = semua.filter((x) => x.status === 'Ditolak' && selisihHari(x.tanggal, hariIni()) <= 7);
  const hariKe = pr.tgl_mulai ? selisihHari(pr.tgl_mulai, hariIni()) + 1 : null;
  tampilkan({
    judul: 'Halo, ' + u.nama.split(' ')[0], sub: 'Admin lapangan · ' + tglPanjang(), nav: '#/a',
    isi: html`${pemilihProyek(list, pr)}
      <div class="kartu" style="background:#0B2149;color:#fff;border-color:#0B2149"><span style="font-size:11px;color:#C9D4E8">PROYEK DITUGASKAN</span><b>${pr.nama}</b>
        <span style="font-size:12px;color:#C9D4E8">${hariKe !== null ? 'Hari ke-' + hariKe + ' · ' : ''}progres disetujui ${h ? pct(h.ringkas.realisasi_pct) : '–'}</span>${h ? bar(h.ringkas.realisasi_pct) : ''}</div>
      ${ditolak.map((x) => html`<div class="kartu merah" style="flex-direction:row;gap:10px"><span style="color:#A3261B;flex:none">${ikon('peringatan', 20)}</span><div class="kolom" style="gap:4px"><b class="kecil" style="color:#A3261B">Laporan ditolak pengelola</b><span class="kecil">${x.judul}${x.catatan ? ': “' + x.catatan + '”' : ''}</span><a class="kecil tebal" href="${x.jenis === 'progres' ? '#/a/progres' : x.jenis === 'biaya' ? '#/a/biaya' : '#/a/material'}">Kirim ulang yang benar</a></div></div>`)}
      <div class="grid2">
        <a class="besar" href="#/a/progres"><span class="ik" style="background:#0B2149;color:#F2A91E">${ikon('grafik')}</span><b>Lapor progres</b><span class="redup" style="margin-top:-6px">+ foto / video</span></a>
        <a class="besar" href="#/a/material?m=MASUK"><span class="ik" style="background:#E3F4EA;color:#1C6B3C">${ikon('masuk')}</span><b>Material masuk</b><span class="redup" style="margin-top:-6px">+ surat jalan</span></a>
        <a class="besar" href="#/a/material?m=PAKAI"><span class="ik" style="background:#FFF1D6;color:#7A4F00">${ikon('pakai')}</span><b>Material pakai</b><span class="redup" style="margin-top:-6px">untuk item RAB</span></a>
        <a class="besar" href="#/a/biaya"><span class="ik" style="background:#EAF0F9;color:#1F4E8C">${ikon('nota')}</span><b>Biaya / nota</b><span class="redup" style="margin-top:-6px">upah, alat, lain-lain</span></a>
      </div>
      ${nAntri ? html`<a class="kartu kuning" href="#/akun" style="flex-direction:row;gap:10px;align-items:center"><span style="color:#7A4F00">${ikon('offline', 20)}</span><span class="kecil"><b>${nAntri} input tersimpan offline.</b> Terkirim otomatis saat sinyal kembali.</span></a>` : ''}
      <div class="kartu"><span class="judul-kartu">Input saya (7 hari)</span>
        ${semua.filter((x) => selisihHari(x.tanggal, hariIni()) <= 7).length ? html`<div class="daftar">${semua.filter((x) => selisihHari(x.tanggal, hariIni()) <= 7).slice(0, 15).map((x) => html`<div class="baris"><div class="kolom"><span class="kecil tebal">${x.judul}${x.ket ? ' · ' + x.ket : ''}</span><span class="redup">${tgl(x.tanggal, false)} · ${x.jenis}</span></div>${pill(x.status, statusKelas(x.status))}</div>`)}</div>` : kosong('Belum ada input minggu ini.')}</div>`,
    aksi: aksiGantiProyek,
  });
}

// ---------------------------------------------------------------- lapor progres
export async function lapor(p, q, tampilkan) {
  tampilkan({ judul: 'Lapor progres', nav: '#/a/progres', isi: memuat() });
  await konfigurasi().catch(() => {});
  const list = await proyekSaya(), pr = pilihProyek(list);
  if (!pr) return tanpaProyek(tampilkan, 'Lapor progres');
  const [items, h] = await Promise.all([
    api('list', { tab: 'RAB_ITEM', proyek_id: pr.proyek_id }, { cache: true }),
    api('dashboardProyek', { proyek_id: pr.proyek_id }, { cache: true }).catch(() => null),
  ]);
  const kon = items.filter((i) => !(i.supply_owner === true || String(i.supply_owner).toUpperCase() === 'TRUE'));
  const prog = {}; (h ? h.progres_item : []).forEach((i) => { prog[i.item_id] = i.progres_pct; });
  const babs = []; const seen = {};
  kon.forEach((i) => { if (!seen[i.bab_kode]) { seen[i.bab_kode] = 1; babs.push({ kode: i.bab_kode, nama: i.bab_nama }); } });
  let babDipilih = q.bab || (babs[0] || {}).kode, itemDipilih = null;
  const media = pengelolaMedia({ wadahId: 'media', minFoto: 2, video: true, keterangan: () => pr.kode + (itemDipilih ? ' · ' + itemDipilih.uraian : '') });
  await batasMedia(media);
  const cuaca = pilihanSheet('PROGRES', 'cuaca', ['Cerah', 'Berawan', 'Hujan ringan', 'Hujan deras']);
  const infoItem = () => {
    if (!itemDipilih) return html`<span class="redup">Pilih item pekerjaan.</span>`;
    const i = itemDipilih;
    return html`<div class="st"><span class="kecil">Bobot item ${pct(i.bobot_pct, 2)} · cara ukur: <b>${i.cara_ukur === 'persen' ? 'persen' : 'volume (' + i.satuan + ')'}</b></span><span class="kecil">Disetujui terakhir: <b>${pct(prog[i.item_id] || 0, 1)}</b>${i.cara_ukur !== 'persen' ? ' dari ' + angka(i.vol_final, 2) + ' ' + i.satuan : ''}</span></div>
      ${i.cara_ukur === 'persen'
        ? html`<div class="f"><label for="nilai">Progres kumulatif sekarang (%)</label><input id="nilai" name="persen_kumulatif" type="number" min="0" max="100" step="0.1" inputmode="decimal" required></div>`
        : html`<div class="f"><label for="nilai">Volume terpasang hari ini (${i.satuan})</label><input id="nilai" name="volume_hari_ini" type="number" min="0" step="any" inputmode="decimal" required><small>Sisa volume ±${angka(Math.max(0, i.vol_final * (1 - (prog[i.item_id] || 0) / 100)), 2)} ${i.satuan}</small></div>`}`;
  };
  const opsiItem = () => kon.filter((i) => i.bab_kode === babDipilih).map((i) => html`<option value="${i.item_id}">${i.no_item}. ${i.uraian}${i.sub_grup ? ' (' + i.sub_grup + ')' : ''} · ${pct(prog[i.item_id] || 0, 0)}</option>`);
  const form = () => html`${pemilihProyek(list, pr)}<form data-kirim="kirim" id="form-progres">
      <div class="kartu">
        <div class="f"><label for="bab">Bab pekerjaan</label><select id="bab" data-ubah="pilihBab">${babs.map((b) => html`<option value="${b.kode}" ${b.kode === babDipilih ? 'selected' : ''}>${b.kode}. ${b.nama}</option>`)}</select></div>
        <div class="f"><label for="item">Item RAB</label><select id="item" name="item_id" required data-ubah="pilihItem"><option value="">— pilih item —</option>${opsiItem()}</select></div>
        <div id="info-item" style="display:flex;flex-direction:column;gap:10px">${infoItem()}</div>
      </div>
      <div class="kartu">
        <div class="f"><label for="tgl">Tanggal</label><input id="tgl" name="tanggal" type="date" value="${hariIni()}" max="${hariIni()}" required></div>
        <div class="f"><label for="uraian">Uraian kegiatan</label><textarea id="uraian" name="uraian_kegiatan" required placeholder="Pekerjaan yang dilakukan hari ini"></textarea></div>
        <div class="f"><span class="lbl">Cuaca</span><div class="chips">${cuaca.map((c, i) => html`<label><input type="radio" name="cuaca" value="${c}" ${i === 0 ? 'checked' : ''}><span>${c}</span></label>`)}</div></div>
        <div class="f"><label for="pekerja">Jumlah pekerja</label><input id="pekerja" name="jumlah_pekerja" type="number" min="0" inputmode="numeric"></div>
        <div class="f"><label for="ht">Hambatan teknis (opsional)</label><input id="ht" name="hambatan_teknis" type="text"></div>
        <div class="f"><label for="hn">Hambatan non-teknis (opsional)</label><input id="hn" name="hambatan_nonteknis" type="text" placeholder="mis. akses jalan, cuaca, izin warga"></div>
      </div>
      <div class="kartu"><div class="baris"><span class="judul-kartu">Bukti foto / video</span><span class="redup">minimal 2 foto</span></div><div id="media"></div></div>
      <button class="btn" type="submit">Kirim untuk approval</button>
      <span class="redup" style="text-align:center">Tanpa sinyal? Laporan disimpan di HP dan terkirim otomatis.</span></form>`;
  tampilkan({
    judul: 'Lapor progres', sub: pr.nama + ' · ' + tgl(hariIni()), nav: '#/a/progres', isi: form(),
    setelah: () => media.gambar(),
    aksi: Object.assign({}, aksiGantiProyek, media.aksi, {
      pilihBab(el) { babDipilih = el.value; itemDipilih = null; document.getElementById('item').innerHTML = html`<option value="">— pilih item —</option>${opsiItem()}`.s; document.getElementById('info-item').innerHTML = infoItem().s; },
      pilihItem(el) { itemDipilih = kon.find((i) => i.item_id === el.value) || null; document.getElementById('info-item').innerHTML = infoItem().s; },
      async kirim(f) {
        const d = dataForm(f);
        try { media.cek(); } catch (e) { return toast(e.message, true); }
        if (!itemDipilih) return toast('Pilih item RAB.', true);
        const row = { proyek_id: pr.proyek_id, tanggal: d.tanggal, item_id: d.item_id, uraian_kegiatan: d.uraian_kegiatan, cuaca: d.cuaca, jumlah_pekerja: d.jumlah_pekerja, hambatan_teknis: d.hambatan_teknis, hambatan_nonteknis: d.hambatan_nonteknis };
        if (itemDipilih.cara_ukur === 'persen') {
          row.persen_kumulatif = d.persen_kumulatif;
          if (Number(d.persen_kumulatif) < (prog[itemDipilih.item_id] || 0) && !(await konfirmasi('Persen lebih kecil dari yang sudah disetujui', 'Progres disetujui terakhir ' + pct(prog[itemDipilih.item_id], 1) + '. Tetap kirim ' + pct(d.persen_kumulatif, 1) + '?'))) return;
        } else row.volume_hari_ini = d.volume_hari_ini;
        const b = f.querySelector('[type=submit]'); b.disabled = true; b.textContent = navigator.onLine ? 'Mengirim…' : 'Menyimpan di HP…';
        const r = await antrian.tambah({ tab: 'PROGRES', row, refTipe: 'PROGRES', media: media.untukKirim(), label: 'Progres ' + itemDipilih.uraian });
        isiUlang(html`<div class="kartu" style="align-items:center;text-align:center;padding:28px 16px">
          <span style="width:64px;height:64px;border-radius:50%;background:${r.gagal ? '#FDE4E1' : r.terkirim ? '#E3F4EA' : '#FFF1D6'};color:${r.gagal ? '#A3261B' : r.terkirim ? '#1C6B3C' : '#7A4F00'};display:flex;align-items:center;justify-content:center">${ikon(r.gagal ? 'peringatan' : r.terkirim ? 'cek' : 'offline', 32)}</span>
          <h2 style="font-size:18px">${r.gagal ? 'Laporan ditolak server' : r.terkirim ? 'Laporan terkirim' : 'Tersimpan di HP'}</h2>
          <span class="kecil">${r.gagal ? r.gagal : r.terkirim ? 'Status: Menunggu approval. Data tampil ke client setelah disetujui pengelola.' : 'Belum ada sinyal. Laporan & foto terkirim otomatis saat online.'}</span>
          ${(r.peringatan || []).map((w) => pill(w, 'warn'))}
          <div class="btn-baris" style="width:100%"><a class="btn garis" href="#/a">Ke beranda</a><button class="btn" data-aksi="lagi">Lapor item lain</button></div></div>`);
      },
      lagi() { pergi('#/a/progres?bab=' + encodeURIComponent(babDipilih) + '&t=' + Date.now()); },
    }),
  });
}

// ---------------------------------------------------------------- material
export async function material(p, q, tampilkan) {
  const mode = q.m || 'MASUK';
  tampilkan({ judul: 'Material', nav: '#/a/material', isi: memuat() });
  const list = await proyekSaya(), pr = pilihProyek(list);
  if (!pr) return tanpaProyek(tampilkan, 'Material');
  const [master, items, h] = await Promise.all([
    api('list', { tab: 'MASTER_MATERIAL' }, { cache: true }),
    api('list', { tab: 'RAB_ITEM', proyek_id: pr.proyek_id }, { cache: true }),
    api('dashboardProyek', { proyek_id: pr.proyek_id }, { cache: true }).catch(() => null),
  ]);
  const stok = {}; (h ? h.stok : []).forEach((s) => { stok[s.kode_material] = s; });
  const kelompok = {}; master.forEach((m) => { (kelompok[m.kelompok] = kelompok[m.kelompok] || []).push(m); });
  const media = pengelolaMedia({ wadahId: 'media', minFoto: mode === 'MASUK' ? 1 : 0, keterangan: () => pr.kode + ' · material ' + mode.toLowerCase() });
  await batasMedia(media);
  const lain = list.filter((x) => x.proyek_id !== pr.proyek_id);
  let kode = (mode !== 'MASUK' && h && h.stok[0] ? h.stok[0].kode_material : master[0] && master[0].kode) || '';
  const mm = () => master.find((m) => m.kode === kode) || {};
  const infoSaldo = () => { const s = stok[kode]; return s ? html`<div class="st"><div class="baris"><span class="kecil">Saldo di lokasi <b>${angka(s.saldo, 2)} ${s.satuan}</b></span>${pill(s.hari_cukup === null ? 'belum dipakai' : '±' + angka(s.hari_cukup, 0) + ' hari', warnaKelas(s.warna))}</div></div>` : html`<span class="redup">Belum ada stok tercatat untuk material ini.</span>`; };
  const seg = [['MASUK', 'Masuk'], ['PAKAI', 'Pakai'], ['RETUR', 'Retur'], ['TRANSFER', 'Transfer']].filter((x) => x[0] !== 'TRANSFER' || lain.length);
  tampilkan({
    judul: 'Material', sub: pr.nama + ' · ' + tgl(hariIni()), nav: '#/a/material',
    isi: html`${pemilihProyek(list, pr)}<div class="seg" role="tablist">${seg.map(([k, l]) => html`<button role="tab" class="${mode === k ? 'on' : ''}" aria-selected="${mode === k}" data-aksi="mode" data-m="${k}">${l}</button>`)}</div>
      <form data-kirim="kirim" class="kartu">
        <div class="f"><label for="mat">Material (master)</label><select id="mat" name="kode_material" data-ubah="pilihMat" required>${Object.keys(kelompok).map((k) => html`<optgroup label="${k}">${kelompok[k].map((m) => html`<option value="${m.kode}" ${m.kode === kode ? 'selected' : ''}>${m.kode} · ${m.nama} (${m.satuan})</option>`)}</optgroup>`)}</select><small id="catatan-mat">${mm().catatan_pencatatan || ''}</small></div>
        ${mode !== 'MASUK' ? html`<div id="saldo">${infoSaldo()}</div>` : ''}
        <div class="f"><label for="qty">Jumlah${mode === 'PAKAI' ? ' dipakai' : ''}</label><input id="qty" name="qty" type="number" min="0" step="any" inputmode="decimal" required data-ubah="hitungTotal"></div>
        ${mode === 'MASUK' ? html`<div class="f"><label for="harga">Harga per satuan (Rp)</label><input id="harga" name="harga_satuan" type="number" min="0" step="any" inputmode="numeric" required value="${mm().harga_acuan || ''}" data-ubah="hitungTotal"></div>
          <div class="st"><span class="redup">Total, dicatat sebagai biaya material</span><span class="nilai" id="total">–</span></div>
          <div class="grid2"><div class="f"><label for="pem">Pemasok</label><input id="pem" name="pemasok" type="text"></div><div class="f"><label for="sj">No. surat jalan</label><input id="sj" name="no_surat_jalan" type="text"></div></div>` : ''}
        ${mode === 'PAKAI' || mode === 'MASUK' ? html`<div class="f"><label for="it">Untuk item pekerjaan (RAB)${mode === 'MASUK' ? ' — opsional, untuk biaya per bab' : ''}</label><select id="it" name="item_id"><option value="">— tidak spesifik —</option>${items.filter((i) => !(i.supply_owner === true || String(i.supply_owner).toUpperCase() === 'TRUE')).map((i) => html`<option value="${i.item_id}">${i.bab_kode}.${i.no_item} ${i.uraian}</option>`)}</select></div>` : ''}
        ${mode === 'TRANSFER' ? html`<div class="f"><label for="tuj">Proyek tujuan</label><select id="tuj" name="proyek_tujuan" required>${lain.map((x) => html`<option value="${x.proyek_id}">${x.nama}</option>`)}</select></div>` : ''}
        <div class="f"><label for="tg">Tanggal</label><input id="tg" name="tanggal" type="date" value="${hariIni()}" max="${hariIni()}"></div>
        <div class="f"><span class="lbl">${mode === 'MASUK' ? 'Foto surat jalan & barang' : 'Foto (opsional)'}</span><div id="media"></div></div>
        <button class="btn" type="submit">Simpan material ${mode.toLowerCase()}</button></form>
      <div class="kartu"><div class="baris"><span class="judul-kartu">Stok di lokasi</span><span class="redup">saldo · perkiraan habis</span></div>
        ${h && h.stok.length ? html`<div class="daftar">${h.stok.map((s) => html`<div class="baris"><div class="kolom"><span class="kecil tebal">${s.nama}</span><span class="redup">${angka(s.saldo, 2)} ${s.satuan} · laju ${angka(s.laju_pakai, 2)}/hari</span></div>${pill(s.hari_cukup === null ? '–' : '±' + angka(s.hari_cukup, 0) + ' hari', warnaKelas(s.warna))}</div>`)}</div>` : kosong('Belum ada stok tercatat.')}</div>`,
    setelah: () => media.gambar(),
    aksi: Object.assign({}, aksiGantiProyek, media.aksi, {
      mode(el) { pergi('#/a/material?m=' + el.dataset.m); },
      pilihMat(el) {
        kode = el.value; const n = document.getElementById('catatan-mat'); if (n) n.textContent = mm().catatan_pencatatan || '';
        const s = document.getElementById('saldo'); if (s) s.innerHTML = infoSaldo().s;
        const hg = document.getElementById('harga'); if (hg && mm().harga_acuan) hg.value = mm().harga_acuan;
        this.hitungTotal();
      },
      hitungTotal() { const t = document.getElementById('total'); if (t) { const qv = Number(document.getElementById('qty').value), hv = Number(document.getElementById('harga').value); t.textContent = qv && hv ? rp(qv * hv) : '–'; } },
      async kirim(f) {
        const d = dataForm(f);
        try { media.cek(); } catch (e) { return toast(e.message, true); }
        const row = Object.assign({ proyek_id: pr.proyek_id, jenis: mode }, d);
        const s = stok[d.kode_material];
        if (mode !== 'MASUK' && s && Number(d.qty) > s.saldo && !(await konfirmasi('Melebihi saldo', 'Saldo tercatat ' + angka(s.saldo, 2) + ' ' + s.satuan + '. Tetap simpan ' + d.qty + '?'))) return;
        const b = f.querySelector('[type=submit]'); b.disabled = true; b.textContent = 'Menyimpan…';
        const r = await antrian.tambah({ tab: 'MATERIAL_TRX', row, refTipe: 'MATERIAL', media: media.untukKirim(), label: 'Material ' + mode.toLowerCase() + ' ' + d.kode_material });
        if (r.gagal) { toast(r.gagal, true); b.disabled = false; b.textContent = 'Simpan'; return; }
        toast(r.terkirim ? (mm().nama || d.kode_material) + ' ' + d.qty + ' tersimpan · menunggu approval pengelola' : 'Tersimpan di HP, dikirim saat online.');
        pergi('#/a/material?m=' + mode + '&t=' + Date.now());
      },
    }),
  });
}

// ---------------------------------------------------------------- biaya
export async function biaya(p, q, tampilkan) {
  tampilkan({ judul: 'Biaya / nota', nav: '#/a/biaya', isi: memuat() });
  await konfigurasi().catch(() => {});
  const list = await proyekSaya(), pr = pilihProyek(list);
  if (!pr) return tanpaProyek(tampilkan, 'Biaya');
  const items = await api('list', { tab: 'RAB_ITEM', proyek_id: pr.proyek_id }, { cache: true });
  const babs = []; const seen = {};
  items.forEach((i) => { if (!seen[i.bab_kode]) { seen[i.bab_kode] = 1; babs.push({ kode: i.bab_kode, nama: i.bab_nama }); } });
  const media = pengelolaMedia({ wadahId: 'media', minFoto: 1, keterangan: () => pr.kode + ' · nota' });
  await batasMedia(media);
  const kat = pilihanSheet('BIAYA', 'kategori', ['Upah', 'Alat', 'Operasional', 'Lain']);
  tampilkan({
    judul: 'Biaya / nota', sub: pr.nama, nav: '#/a/biaya',
    isi: html`${pemilihProyek(list, pr)}<form data-kirim="kirim" class="kartu">
      <span class="redup">Pembelian material dicatat di menu Material (Masuk), bukan di sini.</span>
      <div class="f"><span class="lbl">Kategori</span><div class="chips">${kat.map((k, i) => html`<label><input type="radio" name="kategori" value="${k}" ${i === 0 ? 'checked' : ''}><span>${k}</span></label>`)}</div></div>
      <div class="f"><label for="bb">Bab RAB</label><select id="bb" name="bab_kode"><option value="">— umum / tanpa bab —</option>${babs.map((b) => html`<option value="${b.kode}">${b.kode}. ${b.nama}</option>`)}</select></div>
      <div class="f"><label for="ur">Uraian</label><input id="ur" name="uraian" type="text" required placeholder="mis. Upah tukang 3–9 Nov"></div>
      <div class="grid2"><div class="f"><label for="nom">Nominal (Rp)</label><input id="nom" name="nominal" type="number" min="0" step="1" inputmode="numeric" required></div><div class="f"><label for="ke">Dibayar ke</label><input id="ke" name="dibayar_ke" type="text"></div></div>
      <div class="f"><label for="tg">Tanggal</label><input id="tg" name="tanggal" type="date" value="${hariIni()}" max="${hariIni()}"></div>
      <div class="f"><span class="lbl">Foto nota / kuitansi</span><div id="media"></div><small>Nota hanya bisa dilihat pengelola, tidak pernah tampil ke client.</small></div>
      <button class="btn" type="submit">Simpan biaya</button></form>`,
    setelah: () => media.gambar(),
    aksi: Object.assign({}, aksiGantiProyek, media.aksi, {
      async kirim(f) {
        const d = dataForm(f);
        try { media.cek(); } catch (e) { return toast(e.message, true); }
        const b = f.querySelector('[type=submit]'); b.disabled = true; b.textContent = 'Menyimpan…';
        const r = await antrian.tambah({ tab: 'BIAYA', row: Object.assign({ proyek_id: pr.proyek_id }, d), refTipe: 'BIAYA', media: media.untukKirim(), label: 'Biaya ' + d.uraian });
        if (r.gagal) { toast(r.gagal, true); b.disabled = false; b.textContent = 'Simpan biaya'; return; }
        toast(r.terkirim ? 'Biaya tersimpan · menunggu approval.' : 'Tersimpan di HP, dikirim saat online.');
        pergi('#/a');
      },
    }),
  });
}
void sesi;
