const SHEETS = { accounts: 'Accounts', answers: 'AnswerLog', results: 'Results', violations: 'Violations', pins: 'PinDistribution' };
const HEADERS = {
  accounts: ['username', 'password_hash', 'full_name', 'class', 'role', 'active'],
  answers: ['session_id', 'username', 'full_name', 'class', 'question_no', 'answer_json', 'flagged', 'saved_at'],
  results: ['session_id', 'username', 'full_name', 'class', 'started_at', 'finished_at', 'correct_count', 'total_questions', 'score_percent', 'bilangan_correct', 'bilangan_total', 'aljabar_correct', 'aljabar_total', 'geometri_correct', 'geometri_total', 'data_peluang_correct', 'data_peluang_total', 'answers_json', 'violation_count', 'integrity_status'],
  violations: ['session_id', 'username', 'full_name', 'class', 'event_type', 'occurred_at'],
  pins: ['username', 'full_name', 'class', 'pin', 'generated_at']
};

function doPost(e) {
  try {
    const request = JSON.parse((e.postData && e.postData.contents) || '{}');
    assertSharedSecret_(request.sharedSecret);
    let result;
    switch (request.action) {
      case 'login': result = login_(request); break;
      case 'resume': result = resume_(request); break;
      case 'saveAnswer': result = saveAnswer_(request); break;
      case 'recordViolation': result = recordViolation_(request); break;
      case 'finish': result = finish_(request); break;
      default: throw new Error('Aksi tidak dikenal.');
    }
    return json_({ ok: true, ...result });
  } catch (error) {
    return json_({ ok: false, error: error.message || 'Permintaan tidak dapat diproses.' });
  }
}

function setupTkaSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(key => {
    let sheet = ss.getSheetByName(SHEETS[key]);
    if (!sheet) sheet = ss.insertSheet(SHEETS[key]);
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS[key]);
    else sheet.getRange(1, 1, 1, HEADERS[key].length).setValues([HEADERS[key]]);
    sheet.setFrozenRows(1);
  });
  SpreadsheetApp.getUi().alert('Tab Accounts, AnswerLog, Results, Violations, dan PinDistribution siap. Isi daftar siswa di Accounts, lalu buat PIN unik.');
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Simulasi TKA')
    .addItem('Siapkan tab data', 'setupTkaSheets')
    .addItem('Buat rahasia API', 'generateBackendSecretsInteractive')
    .addItem('Buat PIN unik untuk akun siswa', 'generateMissingStudentPinsInteractive')
    .addItem('Buat akun siswa/guru', 'createAccountInteractive')
    .addToUi();
}

function generateBackendSecretsInteractive() {
  const properties = PropertiesService.getScriptProperties();
  const makeSecret = () => Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  let vercelSecret = properties.getProperty('VERCEL_SHARED_SECRET');
  let sessionSecret = properties.getProperty('SESSION_SECRET');
  if (!vercelSecret) {
    vercelSecret = makeSecret();
    properties.setProperty('VERCEL_SHARED_SECRET', vercelSecret);
  }
  if (!sessionSecret) {
    sessionSecret = makeSecret();
    properties.setProperty('SESSION_SECRET', sessionSecret);
  }
  SpreadsheetApp.getUi().alert(
    'Rahasia backend siap. Simpan VERCEL_SHARED_SECRET di Vercel dengan nama TKA_SHARED_SECRET.\n\n' +
    'VERCEL_SHARED_SECRET:\n' + vercelSecret +
    '\n\nSESSION_SECRET sudah tersimpan di Script Properties dan tidak perlu disalin.'
  );
}

function createAccountInteractive() {
  const ui = SpreadsheetApp.getUi();
  const username = prompt_(ui, 'Nama pengguna');
  const pin = prompt_(ui, 'PIN pribadi (8 angka)');
  const fullName = prompt_(ui, 'Nama lengkap');
  const studentClass = prompt_(ui, 'Kelas (kosongkan untuk guru)');
  const role = studentClass ? 'student' : 'teacher';
  if (!username || !fullName || !/^\d{8}$/.test(pin)) throw new Error('Isi nama pengguna/nama lengkap dan PIN pribadi 8 angka.');
  const sheet = getSheet_('accounts');
  const rows = sheet.getDataRange().getValues();
  if (rows.slice(1).some(row => String(row[0]).toLowerCase() === username.toLowerCase())) {
    throw new Error('Nama pengguna sudah digunakan.');
  }
  sheet.appendRow([username, hashPersonalPin_(pin), fullName, studentClass, role, true]);
  ui.alert('Akun ' + role + ' berhasil dibuat dengan PIN pribadi.');
}

function generateMissingStudentPinsInteractive() {
  const accountsSheet = getSheet_('accounts');
  const accounts = accountsSheet.getDataRange().getValues();
  if (accounts.length < 2) throw new Error('Isi daftar siswa pada tab Accounts terlebih dahulu.');
  const distributionSheet = getSheet_('pins');
  const distribution = distributionSheet.getDataRange().getValues();
  const usedPins = new Set(distribution.slice(1).map(row => String(row[3] || '').trim()).filter(Boolean));
  const usedUsernames = new Set(accounts.slice(1).map(row => String(row[0] || '').trim().toLowerCase()).filter(Boolean));
  const pending = [];
  accounts.slice(1).forEach((row, offset) => {
    const username = String(row[0] || '').trim();
    const fullName = String(row[2] || '').trim();
    const role = String(row[4] || '').trim().toLowerCase();
    const active = row[5] === true || String(row[5]).toUpperCase() === 'TRUE';
    if (fullName && !row[1] && role === 'student' && active) {
      if (!username) row[0] = generateInternalUsername_(offset + 2, usedUsernames);
      usedUsernames.add(String(row[0]).toLowerCase());
      pending.push({ row, sheetRow: offset + 2 });
    }
  });
  if (!pending.length) throw new Error('Tidak ada akun siswa aktif dengan kolom password_hash yang kosong.');
  const pinRows = [];
  const reusablePinRows = distribution.slice(1).map((row, offset) => ({
    sheetRow: offset + 2, row, pin: String(row[3] || '').trim()
  })).filter(item => {
    const mappedUsername = String(item.row[0] || '').trim().toLowerCase();
    const belongsToPendingAccount = pending.some(student => String(student.row[0]).toLowerCase() === mappedUsername);
    return /^\d{8}$/.test(item.pin) && (!mappedUsername || belongsToPendingAccount);
  });
  const assignedPinRows = [];
  pending.forEach(item => {
    const username = String(item.row[0]).toLowerCase();
    const reusableIndex = reusablePinRows.findIndex(candidate => {
      const mappedUsername = String(candidate.row[0] || '').trim().toLowerCase();
      return !mappedUsername || mappedUsername === username;
    });
    const reusable = reusableIndex >= 0 ? reusablePinRows.splice(reusableIndex, 1)[0] : null;
    const pin = reusable ? reusable.pin : generateUniquePin_(usedPins);
    item.row[1] = hashPersonalPin_(pin);
    const distributionRow = [String(item.row[0]), String(item.row[2] || ''), String(item.row[3] || ''), pin, new Date()];
    if (reusable) assignedPinRows.push({ sheetRow: reusable.sheetRow, values: distributionRow });
    else pinRows.push(distributionRow);
  });
  accountsSheet.getRange(2, 1, accounts.length - 1, 2).setValues(accounts.slice(1).map(row => [row[0], row[1]]));
  assignedPinRows.forEach(item => distributionSheet.getRange(item.sheetRow, 1, 1, HEADERS.pins.length).setValues([item.values]));
  const firstRow = distributionSheet.getLastRow() + 1;
  if (pinRows.length) {
    distributionSheet.getRange(firstRow, 4, pinRows.length, 1).setNumberFormat('@');
    distributionSheet.getRange(firstRow, 1, pinRows.length, HEADERS.pins.length).setValues(pinRows);
  }
  SpreadsheetApp.getUi().alert(pending.length + ' PIN unik berhasil dibuat. Lihat tab PinDistribution untuk mencocokkan PIN dengan nama siswa. Bagikan PIN secara privat dan batasi akses ke tab ini.');
}

function generateInternalUsername_(sheetRow, usedUsernames) {
  let suffix = sheetRow;
  let username;
  do {
    username = 'SMP2K-' + String(suffix++).padStart(4, '0');
  } while (usedUsernames.has(username.toLowerCase()));
  usedUsernames.add(username.toLowerCase());
  return username;
}

function generateUniquePin_(usedPins) {
  let pin;
  do {
    const randomHex = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    pin = String(parseInt(randomHex, 16) % 100000000).padStart(8, '0');
  } while (usedPins.has(pin));
  usedPins.add(pin);
  return pin;
}

function prompt_(ui, title) {
  const response = ui.prompt('Pengaturan simulasi TKA', title, ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) throw new Error('Pembuatan akun dibatalkan.');
  return response.getResponseText().trim();
}

function login_(request) {
  const fullName = String(request.fullName || '').trim();
  const username = String(request.username || '').trim();
  const pin = String(request.pin || request.password || '');
  if ((!fullName && !username) || !pin) throw new Error('Isi nama lengkap dan PIN simulasi.');
  const rows = getSheet_('accounts').getDataRange().getValues();
  const account = rows.slice(1).find(row => {
    const identityMatches = fullName
      ? String(row[2] || '').trim().toLowerCase() === fullName.toLowerCase()
      : String(row[0] || '').trim().toLowerCase() === username.toLowerCase();
    return identityMatches && String(row[1]) === hashPersonalPin_(pin) &&
      (row[5] === true || String(row[5]).toUpperCase() === 'TRUE');
  });
  if (!account) {
    throw new Error('Nama lengkap atau PIN simulasi tidak cocok.');
  }
  const now = Date.now();
  const session = {
    sid: Utilities.getUuid(), username: String(account[0]), fullName: String(account[2]),
    studentClass: String(account[3] || ''), role: String(account[4] || 'student'),
    startedAt: now, exp: now + 6 * 60 * 60 * 1000
  };
  return { token: signSession_(session), user: { fullName: session.fullName, studentClass: session.studentClass, role: session.role } };
}

function saveAnswer_(request) {
  const session = verifySession_(request.token);
  if (tabExitCount_(session.sid) >= 2) throw new Error('Sesi dihentikan setelah dua kali keluar dari tab. Nilai simulasi ditetapkan 0.');
  const questionNo = Number(request.questionNo);
  if (!Number.isInteger(questionNo) || questionNo < 1 || questionNo > 30) throw new Error('Nomor soal tidak valid.');
  if (!Array.isArray(request.answer) && request.answer !== null) throw new Error('Format jawaban tidak valid.');
  const sheet = getSheet_('answers');
  const rows = sheet.getDataRange().getValues();
  const rowIndex = rows.findIndex((row, i) => i > 0 && row[0] === session.sid && Number(row[4]) === questionNo);
  const values = [session.sid, session.username, session.fullName, session.studentClass, questionNo,
    JSON.stringify(request.answer), Boolean(request.flagged), new Date()];
  if (rowIndex < 0) sheet.appendRow(values);
  else sheet.getRange(rowIndex + 1, 1, 1, values.length).setValues([values]);
  return { saved: true };
}

function resume_(request) {
  const session = verifySession_(request.token);
  const rows = getSheet_('answers').getDataRange().getValues();
  const answers = rows.slice(1).filter(row => row[0] === session.sid).map(row => ({
    questionNo: Number(row[4]), answer: JSON.parse(String(row[5] || 'null')), flagged: row[6] === true
  }));
  const tabExitCount = tabExitCount_(session.sid);
  return { user: { fullName: session.fullName, studentClass: session.studentClass, role: session.role }, answers, violationCount: violationCount_(session.sid), tabExitCount, attemptTerminated: tabExitCount >= 2 };
}

function recordViolation_(request) {
  const session = verifySession_(request.token);
  const eventType = String(request.eventType || '');
  const allowed = ['tab_hidden', 'fullscreen_exit', 'camera_stopped', 'page_exit'];
  if (allowed.indexOf(eventType) < 0) throw new Error('Jenis pelanggaran tidak valid.');
  getSheet_('violations').appendRow([
    session.sid, session.username, session.fullName, session.studentClass, eventType, new Date()
  ]);
  const tabExitCount = tabExitCount_(session.sid);
  const attemptTerminated = tabExitCount >= 2;
  if (attemptTerminated) writeZeroResult_(session);
  return { recorded: true, violationCount: violationCount_(session.sid), tabExitCount, attemptTerminated, scorePercent: attemptTerminated ? 0 : null };
}

function violationCount_(sessionId) {
  const rows = getSheet_('violations').getDataRange().getValues();
  return rows.slice(1).filter(row => row[0] === sessionId).length;
}

function tabExitCount_(sessionId) {
  const rows = getSheet_('violations').getDataRange().getValues();
  return rows.slice(1).filter(row => row[0] === sessionId && String(row[4]) === 'tab_hidden').length;
}

function writeZeroResult_(session) {
  const answerRows = getSheet_('answers').getDataRange().getValues();
  const answers = answerRows.slice(1).filter(row => row[0] === session.sid).map(row => ({
    questionNo: Number(row[4]), answer: JSON.parse(String(row[5] || 'null')), flagged: row[6] === true
  }));
  const sheet = getSheet_('results');
  const rows = sheet.getDataRange().getValues();
  const rowIndex = rows.findIndex((row, i) => i > 0 && row[0] === session.sid);
  const tabExits = tabExitCount_(session.sid);
  const values = [session.sid, session.username, session.fullName, session.studentClass,
    new Date(session.startedAt), new Date(), 0, 30, 0,
    0, 0, 0, 0, 0, 0, 0, 0, JSON.stringify(answers), violationCount_(session.sid),
    `Nilai 0 — ${tabExits} kali keluar tab`];
  if (rowIndex < 0) sheet.appendRow(values);
  else sheet.getRange(rowIndex + 1, 1, 1, values.length).setValues([values]);
}

function finish_(request) {
  const session = verifySession_(request.token);
  const terminated = tabExitCount_(session.sid) >= 2;
  const answers = Array.isArray(request.answers) ? request.answers.slice(0, 30) : [];
  const summary = request.summary && typeof request.summary === 'object' ? request.summary : {};
  const domains = Array.isArray(summary.domains) ? summary.domains : [];
  const domain = name => domains.find(item => item.name === name) || { correct: 0, total: 0 };
  const bilangan = domain('Bilangan');
  const aljabar = domain('Aljabar');
  const geometri = domain('Geometri dan Pengukuran');
  const dataPeluang = domain('Data dan Peluang');
  const sheet = getSheet_('results');
  const rows = sheet.getDataRange().getValues();
  const rowIndex = rows.findIndex((row, i) => i > 0 && row[0] === session.sid);
  const violations = violationCount_(session.sid);
  const values = [session.sid, session.username, session.fullName, session.studentClass,
    new Date(session.startedAt), new Date(), terminated ? 0 : Number(summary.correct || 0), Number(summary.total || 30), terminated ? 0 : Number(summary.percent || 0),
    terminated ? 0 : Number(bilangan.correct || 0), Number(bilangan.total || 0), terminated ? 0 : Number(aljabar.correct || 0), Number(aljabar.total || 0),
    terminated ? 0 : Number(geometri.correct || 0), Number(geometri.total || 0), terminated ? 0 : Number(dataPeluang.correct || 0), Number(dataPeluang.total || 0),
    JSON.stringify(answers), violations, terminated ? `Nilai 0 — ${tabExitCount_(session.sid)} kali keluar tab` : violations ? 'Perlu ditinjau' : 'Tidak ada pelanggaran tercatat'];
  if (rowIndex < 0) sheet.appendRow(values);
  else sheet.getRange(rowIndex + 1, 1, 1, values.length).setValues([values]);
  return { saved: true, sessionId: session.sid, violationCount: violations, attemptTerminated: terminated, scorePercent: terminated ? 0 : Number(summary.percent || 0), integrityStatus: terminated ? `Nilai 0 — ${tabExitCount_(session.sid)} kali keluar tab` : violations ? 'Perlu ditinjau' : 'Tidak ada pelanggaran tercatat' };
}

function hashPersonalPin_(pin) {
  const properties = PropertiesService.getScriptProperties();
  let salt = properties.getProperty('PIN_SALT');
  if (!salt) {
    salt = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty('PIN_SALT', salt);
  }
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

function signSession_(payload) {
  const secret = PropertiesService.getScriptProperties().getProperty('SESSION_SECRET');
  if (!secret) throw new Error('Pengelola belum mengatur SESSION_SECRET.');
  const body = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  const signature = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, secret));
  return body + '.' + signature;
}

function verifySession_(token) {
  const secret = PropertiesService.getScriptProperties().getProperty('SESSION_SECRET');
  if (!secret || !token || token.indexOf('.') < 1) throw new Error('Sesi tidak berlaku. Silakan login kembali.');
  const parts = token.split('.');
  const expected = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0], secret));
  if (parts[1] !== expected) throw new Error('Sesi tidak berlaku. Silakan login kembali.');
  const session = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  if (Date.now() > session.exp) throw new Error('Sesi berakhir. Silakan login kembali.');
  return session;
}

function assertSharedSecret_(received) {
  const expected = PropertiesService.getScriptProperties().getProperty('VERCEL_SHARED_SECRET');
  if (!expected || received !== expected) throw new Error('Backend menolak permintaan. Periksa konfigurasi layanan.');
}

function getSheet_(key) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS[key]);
  if (!sheet || sheet.getLastRow() === 0) throw new Error('Tab ' + SHEETS[key] + ' belum disiapkan.');
  return sheet;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
