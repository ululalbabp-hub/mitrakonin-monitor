import { html, api, sesi, tampil, toast, dataForm, beranda, antrian, ikon, kv, CFG, tgl, jam, konfirmasi, LS } from '../inti.js';

/** Data proyek & pilihan dropdown dipakai banyak layar. */
let cacheConfig = null;
export async function konfigurasi() {
  if (cacheConfig) return cacheConfig;
  cacheConfig = await api('config', {}, { cache: true });
  return cacheConfig;
}
export function pilihanSheet(tab, kolom, cadangan) {
  const p = cacheConfig && cacheConfig.pilihan_sheet && cacheConfig.pilihan_sheet[tab] && cacheConfig.pilihan_sheet[tab][kolom];
  return p || cadangan || [];
}
export function resetKonfigurasi() { cacheConfig = null; }

export async function layarLogin() {
  tampilLogin('');
}
function tampilLogin(pesan) {
  const app = document.getElementById('app');
  app.innerHTML = html`<div class="login">
    <div class="login-atas">
      <img src="icons/icon-192.png" alt="Logo MITRAKONIN">
      <h1 style="font-size:22px">${CFG.APP_NAME || 'MITRAKONIN Monitor'}</h1>
      <span style="color:#C9D4E8;font-size:13px">Pemantauan proyek konstruksi</span>
    </div>
    <div class="login-form">
      <form id="form-login" novalidate>
        <div class="f"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" inputmode="email" required></div>
        <div class="f"><label for="password">Kata sandi</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
        ${pesan ? html`<div class="kartu merah" role="alert" style="padding:10px"><span class="kecil" style="color:#A3261B">${pesan}</span></div>` : ''}
        <button class="btn" type="submit" id="tombol-masuk">Masuk</button>
        <span class="redup" style="text-align:center">Peran dibaca otomatis dari akun Anda. Lupa kata sandi? Hubungi pengelola.</span>
      </form>
    </div>
    <div class="login-kaki">MITRAKONIN · supported by SEP Consultant</div>
  </div>`.s;
  const f = document.getElementById('form-login');
  f.email.focus();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = dataForm(f), b = document.getElementById('tombol-masuk');
    if (!d.email || !d.password) return tampilLogin('Isi email dan kata sandi.');
    b.disabled = true; b.textContent = 'Memeriksa…';
    try {
      const r = await api('login', { email: d.email.trim(), password: d.password });
      sesi.set({ token: r.token, user: r.user, masuk: Date.now() });
      resetKonfigurasi();
      konfigurasi().catch(() => {});
      location.hash = beranda(r.user);
    } catch (err) { tampilLogin(err.message); document.getElementById('email').value = d.email; }
  });
}

export async function layarAkun(p, q, tampilkan) {
  const u = sesi.user();
  const jobs = await antrian.semua();
  tampilkan({
    judul: 'Akun', sub: u.peran === 'ADMIN' ? 'Admin lapangan' : u.peran === 'CLIENT' ? 'Client' : 'Pengelola', nav: '#/akun',
    isi: html`
      <div class="kartu"><div class="kolom"><b style="font-size:16px">${u.nama}</b><span class="redup">${u.email}${u.no_hp ? ' · ' + u.no_hp : ''}</span></div>
        <span class="redup">Proyek: ${u.peran === 'PENGELOLA' ? 'semua proyek' : (u.proyek || []).length + ' proyek'}</span></div>
      <div class="kartu"><div class="baris"><span class="judul-kartu">Antrian offline</span><span class="pill ${jobs.length ? 'warn' : 'ok'}">${jobs.length} input</span></div>
        ${jobs.length ? html`<div class="daftar">${jobs.map((j) => html`<div class="baris"><div class="kolom"><span class="kecil tebal">${j.label || j.tab}</span><span class="redup">${tgl(j.dibuat)} ${jam(j.dibuat)} · ${(j.media || []).length} berkas tersisa${j.gagal ? ' · GAGAL: ' + j.gagal : ''}</span></div>${j.gagal ? html`<button class="link-btn" data-aksi="hapusJob" data-id="${j.id}">Hapus</button>` : ''}</div>`)}</div>
          <button class="btn garis kecil" data-aksi="kirimUlang">${ikon('segar', 18)} Kirim sekarang</button>` : html`<span class="redup">Semua input sudah terkirim.</span>`}
      </div>
      <form class="kartu" data-kirim="gantiPw">
        <span class="judul-kartu">Ganti kata sandi</span>
        <div class="f"><label for="pw-lama">Kata sandi lama</label><input id="pw-lama" name="lama" type="password" autocomplete="current-password" required></div>
        <div class="f"><label for="pw-baru">Kata sandi baru</label><input id="pw-baru" name="baru" type="password" autocomplete="new-password" minlength="8" required><small>Minimal 8 karakter, berisi huruf dan angka.</small></div>
        <button class="btn garis" type="submit">Simpan kata sandi</button>
      </form>
      <button class="btn tolak" data-aksi="keluar">${ikon('keluar', 18)} Keluar</button>
      <span class="redup" style="text-align:center">${CFG.APP_NAME} · data tersimpan di Google Sheet MITRAKONIN</span>`,
    aksi: {
      async gantiPw(f) {
        const d = dataForm(f);
        try { await api('gantiPassword', d); toast('Kata sandi diganti.'); f.reset(); } catch (e) { toast(e.message, true); }
      },
      async kirimUlang() { await antrian.proses(); location.reload(); },
      async hapusJob(el) { if (await konfirmasi('Hapus input gagal?', 'Input ini tidak akan dikirim.', 'Hapus')) { await antrian.hapus(el.dataset.id); location.reload(); } },
      async keluar() {
        const n = await antrian.jumlah();
        if (n && !(await konfirmasi('Masih ada ' + n + ' input belum terkirim', 'Jika keluar, input tetap tersimpan di HP dan dikirim saat Anda login lagi dengan akun yang sama.', 'Keluar'))) return;
        try { await api('logout'); } catch (e) { /* abaikan */ }
        sesi.hapus(); kv.hapusSemua(); LS.del('mk_proyek'); location.hash = '#/login';
      },
    },
  });
}
