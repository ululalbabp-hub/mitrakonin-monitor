/**
 * Login, sesi, hak akses.
 * Hash password: v1$<iterasi>$<salt>$<hex> = SHA-256 berulang atas (PEPPER | salt | password).
 * PEPPER ada di Script Properties (tidak ikut tersalin saat Sheet disalin — lihat SERAH-TERIMA.md).
 */
function hashPassword_(password, salt, iterasi) {
  var pepper = prop_('PEPPER');
  if (!pepper) throw galat_('KONFIG', 'PEPPER belum diatur. Jalankan setup() dari editor Apps Script.');
  iterasi = iterasi || APP.HASH_ITERASI;
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pepper + '|' + salt + '|' + password, Utilities.Charset.UTF_8);
  for (var i = 1; i < iterasi; i++) b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b);
  return 'v1$' + iterasi + '$' + salt + '$' + b.map(function (x) { return ('0' + (x & 0xff).toString(16)).slice(-2); }).join('');
}

function buatHash_(password) {
  return hashPassword_(password, Utilities.getUuid().replace(/-/g, '').slice(0, 16));
}

function cocokPassword_(password, simpanan) {
  var p = String(simpanan || '').split('$');
  if (p.length !== 4 || p[0] !== 'v1') return false;
  var h = hashPassword_(password, p[2], Number(p[1]));
  // perbandingan panjang tetap
  if (h.length !== simpanan.length) return false;
  var beda = 0;
  for (var i = 0; i < h.length; i++) beda |= h.charCodeAt(i) ^ simpanan.charCodeAt(i);
  return beda === 0;
}

function cekKekuatanPassword_(pw) {
  if (!pw || String(pw).length < 8) throw galat_('VALIDASI', 'Password minimal 8 karakter.');
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw galat_('VALIDASI', 'Password harus berisi huruf dan angka.');
}

function passwordSementara_() {
  var huruf = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', angka = '23456789', s = '';
  var u = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  for (var i = 0; i < 8; i++) s += huruf.charAt(parseInt(u.substr(i * 2, 2), 16) % huruf.length);
  for (var j = 0; j < 3; j++) s += angka.charAt(parseInt(u.substr(20 + j * 2, 2), 16) % angka.length);
  return s;
}

function userPerEmail_(email) {
  email = String(email || '').trim().toLowerCase();
  var r = rows_('USERS');
  for (var i = 0; i < r.length; i++) if (String(r[i].email).trim().toLowerCase() === email) return r[i];
  return null;
}

function aktif_(u) { return u && (u.aktif === true || String(u.aktif).toUpperCase() === 'TRUE'); }

function login_(data) {
  var email = String(data.email || '').trim().toLowerCase();
  var cache = CacheService.getScriptCache(), kunciGagal = 'F:' + email;
  var gagal = Number(cache.get(kunciGagal) || 0);
  if (gagal >= APP.LOGIN_GAGAL_MAKS) throw galat_('AUTH', 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.');
  var u = userPerEmail_(email);
  if (!u || !aktif_(u) || !cocokPassword_(String(data.password || ''), u.password_hash)) {
    cache.put(kunciGagal, String(gagal + 1), APP.LOGIN_KUNCI_DETIK);
    throw galat_('AUTH', 'Email atau password salah.');
  }
  cache.remove(kunciGagal);
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('S:' + token, JSON.stringify({ user_id: u.user_id }), APP.SESI_DETIK);
  denganKunci_(function () { ubah_('USERS', userPerEmail_(email), { login_terakhir: sekarang_() }); });
  return { token: token, user: profil_(u), berlaku_detik: APP.SESI_DETIK };
}

function logout_(token) { if (token) CacheService.getScriptCache().remove('S:' + token); return { keluar: true }; }

/** Ambil user dari token. Sesi diperpanjang setiap dipakai. Status aktif dicek ulang setiap panggilan. */
function sesi_(token) {
  if (!token) throw galat_('AUTH', 'Silakan login.');
  var cache = CacheService.getScriptCache(), s = cache.get('S:' + token);
  if (!s) throw galat_('AUTH', 'Sesi berakhir. Silakan login lagi.');
  var data = JSON.parse(s);
  var u = cari_('USERS', data.user_id);
  if (!u || !aktif_(u)) { cache.remove('S:' + token); throw galat_('AUTH', 'Akun tidak aktif.'); }
  cache.put('S:' + token, s, APP.SESI_DETIK);
  return u;
}

function profil_(u) {
  return { user_id: u.user_id, nama: u.nama, email: u.email, no_hp: u.no_hp, peran: u.peran, proyek: daftarProyekUser_(u) };
}

/** Daftar proyek_id yang boleh diakses user. PENGELOLA = semua. CLIENT juga dari client_email di PROYEK. */
function daftarProyekUser_(u) {
  var semua = rows_('PROYEK').map(function (p) { return String(p.proyek_id); });
  if (u.peran === 'PENGELOLA') return semua;
  var akses = String(u.proyek_akses || '').split(/[,;\s]+/).map(function (x) { return x.trim(); }).filter(String);
  if (akses.indexOf('*') >= 0) return semua;
  var set = {};
  akses.forEach(function (a) { set[a] = true; });
  if (u.peran === 'CLIENT') rows_('PROYEK').forEach(function (p) {
    if (p.client_email && String(p.client_email).trim().toLowerCase() === String(u.email).trim().toLowerCase()) set[p.proyek_id] = true;
  });
  return semua.filter(function (id) { return set[id]; });
}

function bolehProyek_(u, pid) { return daftarProyekUser_(u).indexOf(String(pid)) >= 0; }
function wajibProyek_(u, pid) {
  if (!pid) throw galat_('VALIDASI', 'proyek_id wajib diisi.');
  if (!cari_('PROYEK', pid)) throw galat_('TIDAK_ADA', 'Proyek ' + pid + ' tidak ditemukan.');
  if (!bolehProyek_(u, pid)) throw galat_('AKSES', 'Anda tidak punya akses ke proyek ini.');
}
function wajibPeran_(u, daftar) {
  if (daftar.indexOf(u.peran) < 0) throw galat_('AKSES', 'Aksi ini tidak diizinkan untuk peran ' + u.peran + '.');
}

/** Kolom yang boleh dibaca user untuk tab tertentu; null = tab terlarang. */
function kolomBoleh_(u, tab) {
  if (u.peran === 'PENGELOLA') return '*';
  var h = HAK_BACA[u.peran];
  if (!h || !h[tab]) return null;
  return h[tab];
}

/** Saring baris & kolom sesuai peran. Dipakai SEMUA jalur baca ke HP. */
function saringBaca_(u, tab, rows) {
  var kolom = kolomBoleh_(u, tab);
  if (kolom === null) throw galat_('AKSES', 'Peran ' + u.peran + ' tidak boleh membaca ' + tab + '.');
  var proyek = {};
  daftarProyekUser_(u).forEach(function (p) { proyek[p] = true; });
  var hasil = rows.filter(function (r) {
    if (tab === 'USERS') return true;
    if ('proyek_id' in r && u.peran !== 'PENGELOLA' && !proyek[r.proyek_id]) return false;
    if (u.peran === 'CLIENT') return bolehClient_(tab, r);
    return true;
  });
  return hasil.map(function (r) {
    var o = {};
    if (kolom === '*') { for (var k in r) if (k !== '_baris' && k !== 'password_hash') o[k] = r[k]; }
    else kolom.forEach(function (k) { if (k in r) o[k] = r[k]; });
    return o;
  });
}

/** Client hanya melihat data yang sudah Disetujui. */
function bolehClient_(tab, r) {
  if (tab === 'PROGRES') return r.status === 'Disetujui';
  if (tab === 'RAB_ITEM') return !(r.supply_owner === true || String(r.supply_owner).toUpperCase() === 'TRUE');
  if (tab === 'MEDIA') {
    if (r.ref_tipe === 'PROGRES') { var p = cari_('PROGRES', r.ref_id); return !!p && p.status === 'Disetujui'; }
    if (r.ref_tipe === 'TERMIN') return true;
    return false;
  }
  return true;
}
