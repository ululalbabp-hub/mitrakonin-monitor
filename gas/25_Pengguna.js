/**
 * Pengguna & setting. Hanya PENGELOLA (dicek di router), kecuali gantiPassword & bootstrap.
 */

/** Hanya boleh dipakai sekali: saat belum ada PENGELOLA aktif. */
function bootstrap_(d) {
  return denganKunci_(function () {
    var ada = rows_('USERS').some(function (u) { return u.peran === 'PENGELOLA' && aktif_(u); });
    if (ada) throw galat_('AKSES', 'Bootstrap sudah tidak tersedia (pengelola sudah ada).');
    cekKekuatanPassword_(d.password);
    var row = barisUser_({ nama: d.nama, email: d.email, no_hp: d.no_hp, peran: 'PENGELOLA', proyek_akses: '*' }, d.password);
    sisip_('USERS', [row]);
    catatLog_({ user_id: row.user_id }, 'BOOTSTRAP', 'USERS', row.user_id, null, { email: row.email, peran: row.peran });
    return { user_id: row.user_id, email: row.email };
  });
}

function barisUser_(d, password) {
  var email = String(d.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw galat_('VALIDASI', 'Email tidak valid.');
  if (userPerEmail_(email)) throw galat_('VALIDASI', 'Email ' + email + ' sudah terdaftar.');
  if (PILIHAN.peran.indexOf(d.peran) < 0) throw galat_('VALIDASI', 'Peran harus PENGELOLA, ADMIN, atau CLIENT.');
  if (!d.nama) throw galat_('VALIDASI', 'Nama wajib diisi.');
  return {
    user_id: idBaru_('USERS'), nama: d.nama, email: email, no_hp: d.no_hp || '', peran: d.peran,
    proyek_akses: d.peran === 'PENGELOLA' ? '*' : normalAkses_(d.proyek_akses), password_hash: buatHash_(password), aktif: true, login_terakhir: '',
  };
}

function normalAkses_(a) {
  var list = Array.isArray(a) ? a : String(a || '').split(/[,;\s]+/);
  list = list.map(function (x) { return String(x).trim(); }).filter(String);
  list.forEach(function (pid) { if (pid !== '*' && !cari_('PROYEK', pid)) throw galat_('VALIDASI', 'Proyek ' + pid + ' tidak ditemukan.'); });
  return list.join(',');
}

/** {nama, email, no_hp, peran, proyek_akses, password?, kirim_email?} */
function userCreate_(u, d) {
  var pw = d.password || passwordSementara_();
  cekKekuatanPassword_(pw);
  return denganKunci_(function () {
    var row = barisUser_(d, pw);
    sisip_('USERS', [row]);
    catatLog_(u, 'CREATE', 'USERS', row.user_id, null, { nama: row.nama, email: row.email, peran: row.peran, proyek_akses: row.proyek_akses });
    var hasil = { user_id: row.user_id, email: row.email };
    if (d.kirim_email) { kirimPassword_(row, pw, 'Akun MITRAKONIN Monitor Anda'); hasil.email_terkirim = true; }
    else if (!d.password) hasil.password_sementara = pw; // ditampilkan sekali ke pengelola
    return hasil;
  });
}

function userUpdate_(u, d) {
  return denganKunci_(function () {
    var lama = cari_('USERS', d.user_id);
    if (!lama) throw galat_('TIDAK_ADA', 'Pengguna tidak ditemukan.');
    var ubahan = {};
    ['nama', 'no_hp'].forEach(function (k) { if (k in d) ubahan[k] = d[k]; });
    if ('peran' in d) { if (PILIHAN.peran.indexOf(d.peran) < 0) throw galat_('VALIDASI', 'Peran tidak valid.'); ubahan.peran = d.peran; }
    if ('proyek_akses' in d) ubahan.proyek_akses = (ubahan.peran || lama.peran) === 'PENGELOLA' ? '*' : normalAkses_(d.proyek_akses);
    if ('aktif' in d) {
      if (lama.user_id === u.user_id && !d.aktif) throw galat_('VALIDASI', 'Tidak bisa menonaktifkan akun sendiri.');
      ubahan.aktif = !!d.aktif;
    }
    var nilaiLama = {};
    for (var k in ubahan) nilaiLama[k] = lama[k];
    ubah_('USERS', lama, ubahan);
    catatLog_(u, 'UPDATE', 'USERS', d.user_id, nilaiLama, ubahan);
    return { user_id: d.user_id };
  });
}

function userResetPassword_(u, d) {
  return denganKunci_(function () {
    var lama = cari_('USERS', d.user_id);
    if (!lama) throw galat_('TIDAK_ADA', 'Pengguna tidak ditemukan.');
    var pw = d.password || passwordSementara_();
    cekKekuatanPassword_(pw);
    ubah_('USERS', lama, { password_hash: buatHash_(pw) });
    catatLog_(u, 'RESET_PASSWORD', 'USERS', d.user_id, null, { oleh: u.user_id });
    if (d.kirim_email) { kirimPassword_(lama, pw, 'Password MITRAKONIN Monitor direset'); return { email_terkirim: true }; }
    return d.password ? { ok: true } : { password_sementara: pw };
  });
}

function gantiPassword_(u, d) {
  if (!cocokPassword_(String(d.lama || ''), u.password_hash)) throw galat_('AUTH', 'Password lama salah.');
  cekKekuatanPassword_(d.baru);
  return denganKunci_(function () {
    ubah_('USERS', cari_('USERS', u.user_id), { password_hash: buatHash_(d.baru) });
    catatLog_(u, 'GANTI_PASSWORD', 'USERS', u.user_id, null, null);
    return { ok: true };
  });
}

function kirimPassword_(user, pw, judul) {
  var s = setting_();
  MailApp.sendEmail({
    to: user.email, subject: judul, name: s.nama_perusahaan || 'MITRAKONIN',
    body: 'Halo ' + user.nama + ',\n\nEmail: ' + user.email + '\nPassword sementara: ' + pw +
      '\n\nSilakan login lalu ganti password Anda di menu Profil.\n\n' + (s.nama_perusahaan || 'MITRAKONIN'),
  });
}

function settingSet_(u, d) {
  return denganKunci_(function () {
    var r = rows_('SETTING').filter(function (x) { return x.kunci === d.kunci; })[0];
    if (!r) throw galat_('TIDAK_ADA', 'Kunci setting ' + d.kunci + ' tidak ada.');
    ubah_('SETTING', r, { nilai: d.nilai });
    catatLog_(u, 'UPDATE', 'SETTING', d.kunci, { nilai: r.nilai }, { nilai: d.nilai });
    return { kunci: d.kunci, nilai: d.nilai };
  });
}
