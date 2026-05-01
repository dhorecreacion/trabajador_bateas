import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getDatabase, ref, onValue, set, update, remove } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

/* ── Firebase ── */
const firebaseConfig = {
    apiKey: "AIzaSyA3aOSYvAd-UuETV1K2Wgw6CnZK16nDp2U",
    authDomain: "trabajador-bateas.firebaseapp.com",
    databaseURL: "https://trabajador-bateas-default-rtdb.firebaseio.com",
    projectId: "trabajador-bateas",
    storageBucket: "trabajador-bateas.firebasestorage.app",
    messagingSenderId: "193278652870",
    appId: "1:193278652870:web:24a29d24ca907ea182c2c7"
  };

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

/* ── Refs UI ── */
const peopleMeta     = document.getElementById('peopleMeta');
const delMeta        = document.getElementById('delMeta');
const q              = document.getElementById('q');
const sedeFilter     = document.getElementById('sedeFilter');
const planillaFilter = document.getElementById('planillaFilter');
const limitSel       = document.getElementById('limit');
const results        = document.getElementById('results');
const toast          = document.getElementById('toast');
const selectedPill   = document.getElementById('selectedPill');
const selectedHint   = document.getElementById('selectedHint');
const modalConfirm        = document.getElementById('modalConfirm');
const btnCloseModalConfirm = document.getElementById('btnCloseModalConfirm');
const btnConfirm     = document.getElementById('btnConfirm');
const btnClearSel    = document.getElementById('btnClearSel');
const hist           = document.getElementById('hist');
const btnReload      = document.getElementById('btnReload');
const btnExportXlsx  = document.getElementById('btnExportXlsx');

/* ── Estado ── */
let people     = [];
let entregas   = {};
let selected   = null;
let confirming = false;

/* ══════════════════════════════════
   HELPERS
══════════════════════════════════ */
const norm = (s) => (s ?? '').toString().trim().toLowerCase();

function showToast(msg, ms = 2600) {
  toast.textContent = msg;
  toast.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.style.display = 'none'; }, ms);
}

function escapeHtml(s) {
  return (s ?? '').toString()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatLocal(iso) {
  return new Date(iso).toLocaleString();
}

function excelDateToStr(val) {
  if (!val) return '';
  const n = Number(val);
  if (!isNaN(n) && n > 1000) {
    const d = new Date(Date.UTC(1900, 0, 1) + (n - 2) * 86400000);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  return String(val).trim();
}

/* ══════════════════════════════════
   DATOS
══════════════════════════════════ */
function normalizePerson(dni, obj) {
  return {
    dni:               (dni ?? '').toString().trim(),
    apellidos_nombres: (obj?.APELLIDOS_NOMBRES ?? obj?.apellidos_nombres ?? obj?.Apellidos_Nombres ?? '').toString().trim(),
    planilla:          (obj?.PLANILLA  ?? obj?.planilla  ?? obj?.Planilla  ?? '').toString().trim(),
    sexo:              (obj?.SEXO      ?? obj?.sexo      ?? obj?.Sexo      ?? '').toString().trim(),
    tallas:            (obj?.TALLAS      ?? obj?.tallas      ?? obj?.Tallas      ?? '').toString().trim(),
    sede:              (obj?.SEDE        ?? obj?.sede        ?? obj?.Sede        ?? '').toString().trim(),
    cumpleanos:        excelDateToStr(obj?.CUMPLEANOS  ?? obj?.cumpleanos  ?? obj?.CUMPLEAÑOS  ?? obj?.cumpleaños  ?? ''),
  };
}

function isDelivered(dni) {
  return !!entregas?.[dni]?.entregado;
}

/* ══════════════════════════════════
   FILTROS Y BÚSQUEDA
══════════════════════════════════ */
function refreshSedeFilter() {
  const set_ = new Set(people.map(p => p.sede).filter(Boolean));
  const arr  = Array.from(set_).sort((a, b) => a.localeCompare(b));
  sedeFilter.innerHTML =
    '<option value="">Todas las sedes</option>' +
    arr.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('');
}

function refreshPlanillaFilter() {
  const set_ = new Set(people.map(p => p.planilla).filter(Boolean));
  const arr  = Array.from(set_).sort((a, b) => a.localeCompare(b));
  planillaFilter.innerHTML =
    '<option value="">Todas las planillas</option>' +
    arr.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('');
}

function applyFilters(source) {
  const qq   = norm(q.value);
  const sede = sedeFilter.value;
  const plan = planillaFilter.value;
  const lim  = parseInt(limitSel.value, 10);

  let arr = source.filter(p => !isDelivered(p.dni));
  if (sede) arr = arr.filter(p => p.sede === sede);
  if (plan) arr = arr.filter(p => p.planilla === plan);
  if (qq)   arr = arr.filter(p => `${p.dni} ${p.apellidos_nombres}`.toLowerCase().includes(qq));
  return arr.slice(0, lim);
}

/* ══════════════════════════════════
   RENDER
══════════════════════════════════ */
function refreshMeta() {
  const pendientes = people.filter(p => !isDelivered(p.dni)).length;
  peopleMeta.textContent = `${pendientes} pendientes`;
  delMeta.textContent    = `${Object.keys(entregas || {}).filter(d => entregas[d]?.entregado).length} entregas`;
}

function openModalConfirm() { modalConfirm.classList.add('open'); }
function closeModalConfirm() {
  modalConfirm.classList.remove('open');
  selected = null;
  clearSigCanvas();
  selectedPill.style.display = 'none';
}

function setSelected(p) {
  selected = p || null;
  if (!selected) { closeModalConfirm(); return; }

  selectedPill.style.display = 'flex';
  selectedHint.textContent   = 'Confirma la entrega.';
  selectedPill.innerHTML = `
    <span class="chip">DNI</span> <b>${escapeHtml(selected.dni)}</b>
    <span class="chip">NOMBRE</span> <b>${escapeHtml(selected.apellidos_nombres)}</b>
    <span class="chip">PLANILLA</span> <b>${escapeHtml(selected.planilla)}</b>
    <span class="chip">SEDE</span> <b>${escapeHtml(selected.sede)}</b>
    <span class="chip">TALLA</span> <b>${escapeHtml(selected.tallas)}</b>
  `;
  openModalConfirm();
}

function searchPeople() {
  const arr = applyFilters(people);

  results.innerHTML = arr.map((p, idx) => `
    <div class="rowitem">
      <div class="who">
        <strong>${escapeHtml(p.apellidos_nombres || '(sin nombre)')}</strong>
        <span>${escapeHtml(p.planilla || '-')} &middot; Sede: ${escapeHtml(p.sede || '-')} &middot; Talla: ${escapeHtml(p.tallas || '-')}${p.cumpleanos ? ' &middot; 🎂 ' + escapeHtml(p.cumpleanos) : ''}</span>
      </div>
      <div style="display:flex; gap:10px; align-items:center">
        <span class="mono">${escapeHtml(p.dni)}</span>
        <button class="btn ok" data-pick="${idx}">Elegir</button>
      </div>
    </div>
  `).join('');

  results.querySelectorAll('button[data-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      const arr2 = applyFilters(people);
      setSelected(arr2[parseInt(btn.getAttribute('data-pick'), 10)]);
    });
  });

  refreshMeta();
}

function renderHistory() {
  const mapPeople = new Map(people.map(p => [p.dni, p]));
  const rows = Object.entries(entregas || {})
    .filter(([, e]) => e && e.entregado)
    .map(([dni, e]) => ({ dni, ...e }))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  hist.innerHTML = rows.map(e => {
    const p       = mapPeople.get(e.dni);
    const nombre  = p ? p.apellidos_nombres : '-';
    const planilla = p ? p.planilla : '-';
    const sede    = p ? p.sede : '-';
    const tallas     = p ? p.tallas : '-';
    const cumpleanos = p ? (p.cumpleanos || '-') : '-';
    return `
      <tr>
        <td class="mono">${escapeHtml(formatLocal(e.timestamp))}</td>
        <td class="mono">${escapeHtml(e.dni)}</td>
        <td>${escapeHtml(nombre)}</td>
        <td>${escapeHtml(planilla)}</td>
        <td>${escapeHtml(sede)}</td>
        <td class="mono">${escapeHtml(tallas)}</td>
        <td class="mono">${escapeHtml(cumpleanos)}</td>
        <td><b>${escapeHtml(e.item || '-')}</b></td>
        <td style="white-space:nowrap; display:flex; gap:4px;">
          ${e.firma ? `<button class="btn" data-firma="${escapeHtml(e.dni)}" title="Ver firma">✍</button>` : ''}
          <button class="btn danger" data-undo="${escapeHtml(e.dni)}">Revertir</button>
        </td>
      </tr>
    `;
  }).join('');

  hist.querySelectorAll('button[data-firma]').forEach(b => {
    b.addEventListener('click', () => {
      const dni = b.getAttribute('data-firma');
      const e   = entregas[dni];
      const p   = mapPeople.get(dni);
      openFirmaModal(e?.firma, p?.apellidos_nombres || dni);
    });
  });

  hist.querySelectorAll('button[data-undo]').forEach(b => {
    b.addEventListener('click', async () => {
      const dni = b.getAttribute('data-undo');
      if (!confirm(`¿Volver a pendiente al DNI ${dni}?`)) return;
      try {
        await remove(ref(db, `Entregas/${dni}`));
        showToast('Revertido a pendiente.');
      } catch (err) {
        console.error(err);
        showToast('Error al revertir.');
      }
    });
  });

  refreshMeta();
}

/* ══════════════════════════════════
   CONFIRMAR ENTREGA
══════════════════════════════════ */
btnConfirm.addEventListener('click', async () => {
  if (confirming) return;
  if (!selected) return showToast('Selecciona una persona.');
  confirming = true;
  btnConfirm.disabled = true;
  const old = btnConfirm.textContent;
  btnConfirm.textContent = 'Confirmando...';
  try {
    const firmaCode = encodeStrokes();
    await set(ref(db, `Entregas/${selected.dni}`), {
      entregado: true,
      timestamp: new Date().toISOString(),
      firma: firmaCode || null,
    });
    closeModalConfirm();
    showToast('Entrega confirmada ✅');
  } catch (err) {
    console.error(err);
    showToast('Error confirmando (revisa rules).');
  } finally {
    btnConfirm.textContent = old;
    btnConfirm.disabled    = false;
    confirming             = false;
  }
});

btnClearSel.addEventListener('click', closeModalConfirm);
btnCloseModalConfirm.addEventListener('click', closeModalConfirm);
modalConfirm.addEventListener('click', e => { if (e.target === modalConfirm) closeModalConfirm(); });

/* ══════════════════════════════════
   EXPORTAR EXCEL
══════════════════════════════════ */
function exportXlsx() {
  const mapPeople  = new Map(people.map(p => [p.dni, p]));
  const entregados = Object.entries(entregas || {})
    .filter(([, e]) => e && e.entregado)
    .map(([dni, e]) => {
      const p = mapPeople.get(dni);
      return {
        DNI:                  dni,
        'Apellidos y Nombres': p?.apellidos_nombres ?? '',
        Planilla:             p?.planilla ?? '',
        Sexo:                 p?.sexo ?? '',
        Tallas:               p?.tallas ?? '',
        Sede:                 p?.sede ?? '',
        'Ítem':               e.item || '',
        'Fecha ISO':          e.timestamp || '',
        'Fecha local':        e.timestamp ? formatLocal(e.timestamp) : '',
      };
    })
    .sort((a, b) => (a['Fecha ISO'] || '').localeCompare(b['Fecha ISO'] || ''));

  const pendientes = people
    .filter(p => !isDelivered(p.dni))
    .map(p => ({
      DNI:                  p.dni,
      'Apellidos y Nombres': p.apellidos_nombres,
      Planilla:             p.planilla,
      Sexo:                 p.sexo,
      Tallas:               p.tallas,
      Sede:                 p.sede,
    }))
    .sort((a, b) => (a.DNI || '').localeCompare(b.DNI || ''));

  if (!entregados.length && !pendientes.length) {
    showToast('No hay datos para exportar.');
    return;
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entregados), 'Entregados');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pendientes), 'Pendientes');
  XLSX.writeFile(wb, `Entrega_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ══════════════════════════════════
   FIRMA DIGITAL
══════════════════════════════════ */
const sigCanvas  = document.getElementById('sigCanvas');
const sigCtx     = sigCanvas.getContext('2d');
const sigHint    = document.getElementById('sigHint');
const btnClearSig = document.getElementById('btnClearSig');

let sigStrokes = [];
let sigCurrent = null;
let sigDrawing = false;

function resizeSigCanvas() {
  const prev = exportSigImage();
  sigCanvas.width  = sigCanvas.offsetWidth  || 400;
  sigCanvas.height = sigCanvas.offsetHeight || 130;
  redrawSig();
  if (prev) sigHint.style.display = 'none';
}

function getPos(e) {
  const rect = sigCanvas.getBoundingClientRect();
  const src  = e.touches ? e.touches[0] : e;
  return {
    x: Math.round(((src.clientX - rect.left) / rect.width)  * sigCanvas.width),
    y: Math.round(((src.clientY - rect.top)  / rect.height) * sigCanvas.height),
  };
}

function drawSigLine(x, y) {
  sigCtx.lineWidth   = 2;
  sigCtx.lineCap     = 'round';
  sigCtx.lineJoin    = 'round';
  sigCtx.strokeStyle = '#0f172a';
  sigCtx.lineTo(x, y);
  sigCtx.stroke();
  sigCtx.beginPath();
  sigCtx.moveTo(x, y);
}

function redrawSig() {
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  for (const stroke of sigStrokes) {
    if (!stroke.length) continue;
    sigCtx.beginPath();
    sigCtx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length; i++) drawSigLine(stroke[i].x, stroke[i].y);
  }
}

function clearSigCanvas() {
  sigStrokes = [];
  sigCurrent = null;
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  sigHint.style.display = '';
}

function exportSigImage() {
  return sigStrokes.length ? sigCanvas.toDataURL('image/png') : null;
}

function encodeStrokes() {
  if (!sigStrokes.length) return '';
  const W = sigCanvas.width  || 400;
  const H = sigCanvas.height || 130;
  return sigStrokes
    .filter(s => s.length)
    .map(s => s.map(p => `${Math.round((p.x / W) * 999)},${Math.round((p.y / H) * 999)}`).join(','))
    .join('|');
}

function decodeAndDraw(code, canvas) {
  if (!code) return;
  const ctx = canvas.getContext('2d');
  const W   = canvas.width;
  const H   = canvas.height;
  ctx.clearRect(0, 0, W, H);
  for (const stroke of code.split('|')) {
    const nums = stroke.split(',').map(Number);
    if (nums.length < 2) continue;
    ctx.beginPath();
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.moveTo((nums[0] / 999) * W, (nums[1] / 999) * H);
    for (let i = 2; i < nums.length - 1; i += 2) {
      ctx.lineTo((nums[i] / 999) * W, (nums[i + 1] / 999) * H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo((nums[i] / 999) * W, (nums[i + 1] / 999) * H);
    }
  }
}

/* eventos canvas */
sigCanvas.addEventListener('mousedown', e => {
  sigDrawing = true;
  const pos  = getPos(e);
  sigCurrent = [pos];
  sigCtx.beginPath();
  sigCtx.moveTo(pos.x, pos.y);
  sigHint.style.display = 'none';
});
sigCanvas.addEventListener('mousemove', e => {
  if (!sigDrawing) return;
  const pos = getPos(e);
  sigCurrent.push(pos);
  drawSigLine(pos.x, pos.y);
});
sigCanvas.addEventListener('mouseup',  () => { if (sigDrawing && sigCurrent?.length) { sigStrokes.push(sigCurrent); sigCurrent = null; } sigDrawing = false; });
sigCanvas.addEventListener('mouseout', () => { if (sigDrawing && sigCurrent?.length) { sigStrokes.push(sigCurrent); sigCurrent = null; } sigDrawing = false; });

sigCanvas.addEventListener('touchstart', e => {
  e.preventDefault();
  sigDrawing = true;
  const pos  = getPos(e);
  sigCurrent = [pos];
  sigCtx.beginPath();
  sigCtx.moveTo(pos.x, pos.y);
  sigHint.style.display = 'none';
}, { passive: false });
sigCanvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!sigDrawing) return;
  const pos = getPos(e);
  sigCurrent.push(pos);
  drawSigLine(pos.x, pos.y);
}, { passive: false });
sigCanvas.addEventListener('touchend', () => {
  if (sigDrawing && sigCurrent?.length) { sigStrokes.push(sigCurrent); sigCurrent = null; }
  sigDrawing = false;
});

btnClearSig.addEventListener('click', clearSigCanvas);
window.addEventListener('resize', resizeSigCanvas);
setTimeout(resizeSigCanvas, 50);

/* ══════════════════════════════════
   MODAL VER FIRMA
══════════════════════════════════ */
const modalFirma       = document.getElementById('modalFirma');
const modalFirmaTitulo = document.getElementById('modalFirmaTitulo');
const sigViewCanvas    = document.getElementById('sigViewCanvas');

function openFirmaModal(code, nombre) {
  modalFirmaTitulo.textContent = `Firma de ${nombre}`;
  modalFirma.classList.add('open');
  setTimeout(() => {
    sigViewCanvas.width  = sigViewCanvas.offsetWidth  || 440;
    sigViewCanvas.height = sigViewCanvas.offsetHeight || 180;
    decodeAndDraw(code, sigViewCanvas);
  }, 30);
}

document.getElementById('btnCloseModalFirma').addEventListener('click',  () => modalFirma.classList.remove('open'));
document.getElementById('btnCloseModalFirma2').addEventListener('click', () => modalFirma.classList.remove('open'));
modalFirma.addEventListener('click', e => { if (e.target === modalFirma) modalFirma.classList.remove('open'); });

/* ══════════════════════════════════
   EVENTOS GENERALES
══════════════════════════════════ */
btnExportXlsx.addEventListener('click', exportXlsx);
q.addEventListener('input', searchPeople);
sedeFilter.addEventListener('change', searchPeople);
planillaFilter.addEventListener('change', searchPeople);
limitSel.addEventListener('change', searchPeople);
btnReload.addEventListener('click', () => location.reload());

/* ── Hamburger menu ── */
const btnHamburger  = document.getElementById('btnHamburger');
const headerActions = document.getElementById('headerActions');

btnHamburger.addEventListener('click', () => {
  const isOpen = headerActions.classList.toggle('open');
  btnHamburger.classList.toggle('open', isOpen);
  btnHamburger.setAttribute('aria-expanded', isOpen);
});

/* cerrar menú al hacer click fuera del header */
document.addEventListener('click', e => {
  if (!e.target.closest('.site-header')) {
    headerActions.classList.remove('open');
    btnHamburger.classList.remove('open');
    btnHamburger.setAttribute('aria-expanded', 'false');
  }
});

/* cerrar menú al ejecutar cualquier acción */
headerActions.addEventListener('click', e => {
  if (e.target.tagName === 'BUTTON') {
    headerActions.classList.remove('open');
    btnHamburger.classList.remove('open');
    btnHamburger.setAttribute('aria-expanded', 'false');
  }
});

/* ══════════════════════════════════
   MODAL CARGAR PLANTILLA
══════════════════════════════════ */
let parsedUploadData = null;

const modalUpload      = document.getElementById('modalUpload');
const btnOpenUpload    = document.getElementById('btnOpenUpload');
const btnCloseModal    = document.getElementById('btnCloseModal');
const btnCancelUpload  = document.getElementById('btnCancelUpload');
const fileInput        = document.getElementById('fileInput');
const uploadDrop       = document.getElementById('uploadDrop');
const browseLink       = document.getElementById('browseLink');
const fileNameBadge    = document.getElementById('fileNameBadge');
const nodeNameInput    = document.getElementById('nodeNameInput');
const nodeNamePreview  = document.getElementById('nodeNamePreview');
const previewSection   = document.getElementById('previewSection');
const previewMeta      = document.getElementById('previewMeta');
const previewHead      = document.getElementById('previewHead');
const previewBody      = document.getElementById('previewBody');
const uploadOptions    = document.getElementById('uploadOptions');
const clearEntregasOpt = document.getElementById('clearEntregasOpt');
const mergeOpt         = document.getElementById('mergeOpt');
const btnUpload        = document.getElementById('btnUpload');
const uploadStatus     = document.getElementById('uploadStatus');

function openModal() {
  modalUpload.classList.add('open');
  resetModal();
}

function closeModal() {
  modalUpload.classList.remove('open');
}

function resetModal() {
  parsedUploadData              = null;
  fileInput.value               = '';
  fileNameBadge.style.display   = 'none';
  previewSection.style.display  = 'none';
  uploadOptions.style.display   = 'none';
  btnUpload.disabled            = true;
  uploadStatus.textContent      = '';
  clearEntregasOpt.checked      = false;
  mergeOpt.checked              = true;
}

btnOpenUpload.addEventListener('click', () => {
  const pwd = prompt('Ingresa la contraseña para cargar la plantilla:');
  if (pwd === null) return;
  if (pwd !== 'calidaddevida') {
    alert('Contraseña incorrecta.');
    return;
  }
  openModal();
});

btnCloseModal.addEventListener('click', closeModal);
btnCancelUpload.addEventListener('click', closeModal);
modalUpload.addEventListener('click', e => { if (e.target === modalUpload) closeModal(); });

browseLink.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
uploadDrop.addEventListener('click', () => fileInput.click());
uploadDrop.addEventListener('dragover',  e => { e.preventDefault(); uploadDrop.classList.add('over'); });
uploadDrop.addEventListener('dragleave', ()  => uploadDrop.classList.remove('over'));
uploadDrop.addEventListener('drop', e => {
  e.preventDefault();
  uploadDrop.classList.remove('over');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) processFile(fileInput.files[0]);
});

nodeNameInput.addEventListener('input', () => {
  nodeNamePreview.textContent = nodeNameInput.value.trim() || 'Personal';
});

/* ── Mapeo flexible de columnas ── */
function findCol(keys, ...opts) {
  return keys.find(k => opts.some(o => k.trim().toUpperCase() === o.toUpperCase())) || '';
}

function rowsToPersons(rows) {
  if (!rows.length) return [];
  const keys    = Object.keys(rows[0]);
  const dniCol  = findCol(keys, 'DNI', 'DOC', 'DOCUMENTO', 'N_DOC', 'NDOC', 'NRO_DOC', 'NRO DOC');
  const nomCol  = findCol(keys, 'APELLIDOS_NOMBRES', 'Apellidos_Nombres', 'APELLIDOS Y NOMBRES', 'APELLIDOS NOMBRES', 'NOMBRE COMPLETO', 'NOMBRES Y APELLIDOS');
  const planCol = findCol(keys, 'PLANILLA', 'Planilla', 'TIPO_PLANILLA', 'TIPO PLANILLA');
  const sexoCol = findCol(keys, 'SEXO', 'Sexo', 'GENERO', 'GÉNERO');
  const tallCol = findCol(keys, 'TALLAS', 'Tallas', 'TALLA', 'TALLA_POLO', 'POLO');
  const sedeCol = findCol(keys, 'SEDE', 'Sede', 'AREA', 'ÁREA', 'OFICINA', 'LUGAR');
  const cumCol  = findCol(keys, 'CUMPLEAÑOS', 'CUMPLEANOS', 'CUMPLE', 'FECHA_CUMPLE', 'FECHA_NACIMIENTO', 'NACIMIENTO', 'FEC_NAC', 'FECHA NAC', 'BIRTHDAY');

  return rows
    .map(r => ({
      dni:               String(r[dniCol]  ?? '').trim(),
      apellidos_nombres: String(r[nomCol]  ?? '').trim(),
      planilla:          String(r[planCol] ?? '').trim(),
      sexo:              String(r[sexoCol] ?? '').trim(),
      tallas:            String(r[tallCol] ?? '').trim(),
      sede:              String(r[sedeCol] ?? '').trim(),
      cumpleanos:        excelDateToStr(r[cumCol] ?? ''),
    }))
    .filter(r => r.dni);
}

function parseJsonToPersons(text) {
  const data = JSON.parse(text);
  if (Array.isArray(data)) return rowsToPersons(data);

  const topKeys = Object.keys(data);
  if (!topKeys.length) return [];

  const firstVal = data[topKeys[0]];
  if (firstVal && typeof firstVal === 'object' && !Array.isArray(firstVal)) {
    const innerKeys = Object.keys(firstVal);
    if (innerKeys.length) {
      const innerVal = firstVal[innerKeys[0]];
      if (innerVal && typeof innerVal === 'object' &&
          (innerVal.APELLIDOS_NOMBRES || innerVal.apellidos_nombres || innerVal.SEDE || innerVal.PLANILLA)) {
        return Object.entries(firstVal).map(([dni, obj]) => normalizePerson(dni, obj));
      }
    }
    if (firstVal.APELLIDOS_NOMBRES || firstVal.apellidos_nombres || firstVal.SEDE || firstVal.PLANILLA) {
      return Object.entries(data).map(([dni, obj]) => normalizePerson(dni, obj));
    }
  }
  return [];
}

async function processFile(file) {
  uploadStatus.textContent     = 'Procesando...';
  fileNameBadge.style.display  = 'block';
  fileNameBadge.textContent    = '📄 ' + file.name;
  parsedUploadData             = null;
  btnUpload.disabled           = true;
  previewSection.style.display = 'none';
  uploadOptions.style.display  = 'none';

  try {
    let persons = [];
    const ext   = file.name.split('.').pop().toLowerCase();

    if (ext === 'json') {
      const text = await file.text();
      persons    = parseJsonToPersons(text);
    } else {
      const buffer   = await file.arrayBuffer();
      const wb       = XLSX.read(buffer, { type: 'array' });
      const sheetName = wb.SheetNames.find(n => n.trim().toLowerCase() === 'data') ?? wb.SheetNames[0];
      const ws       = wb.Sheets[sheetName];
      const rows     = XLSX.utils.sheet_to_json(ws, { defval: '' });
      persons        = rowsToPersons(rows);
      uploadStatus.textContent = `Hoja leída: "${sheetName}"`;
      await new Promise(r => setTimeout(r, 600));
    }

    if (!persons.length) {
      uploadStatus.textContent = '⚠ No se encontraron registros. Verifica las columnas: DNI, Apellidos_Nombres, Planilla, Sexo, Tallas, Sede.';
      return;
    }

    parsedUploadData         = persons;
    uploadStatus.textContent = '';
    renderPreview(persons);

  } catch (err) {
    console.error(err);
    uploadStatus.textContent = '⚠ Error al leer el archivo: ' + err.message;
  }
}

function renderPreview(persons) {
  const hasCumple = persons.some(p => p.cumpleanos);
  const sample    = persons.slice(0, 8);
  previewHead.innerHTML =
    '<th>DNI</th><th>Apellidos y Nombres</th><th>Planilla</th><th>Sexo</th><th>Tallas</th><th>Sede</th>' +
    (hasCumple ? '<th>Cumpleaños</th>' : '');
  previewBody.innerHTML = sample.map(p => `
    <tr>
      <td class="mono">${escapeHtml(p.dni)}</td>
      <td>${escapeHtml(p.apellidos_nombres)}</td>
      <td>${escapeHtml(p.planilla)}</td>
      <td>${escapeHtml(p.sexo)}</td>
      <td>${escapeHtml(p.tallas)}</td>
      <td>${escapeHtml(p.sede)}</td>
      ${hasCumple ? `<td class="mono">${escapeHtml(p.cumpleanos)}</td>` : ''}
    </tr>
  `).join('');

  const total = persons.length;
  previewMeta.textContent      = `— ${total} registro${total !== 1 ? 's' : ''}${total > 8 ? ` (mostrando 8 de ${total})` : ''}`;
  previewSection.style.display = 'block';
  uploadOptions.style.display  = 'block';
  btnUpload.disabled           = false;
}

btnUpload.addEventListener('click', async () => {
  if (!parsedUploadData?.length) return;
  const nodeName  = nodeNameInput.value.trim() || 'Personal';
  const clearEntr = clearEntregasOpt.checked;

  const msg = `¿Cargar ${parsedUploadData.length} registros en /${nodeName}?` +
    (clearEntr ? '\n\nTambién se eliminarán TODAS las /Entregas.' : '');
  if (!confirm(msg)) return;

  btnUpload.disabled       = true;
  uploadStatus.textContent = 'Cargando...';

  try {
    const obj = {};
    for (const p of parsedUploadData) {
      const record = {
        APELLIDOS_NOMBRES: p.apellidos_nombres,
        PLANILLA:          p.planilla,
        SEXO:              p.sexo,
        TALLAS:            p.tallas,
        SEDE:              p.sede,
      };
      if (p.cumpleanos) record.CUMPLEANOS = p.cumpleanos;
      obj[p.dni] = record;
    }

    if (mergeOpt.checked) {
      await update(ref(db, nodeName), obj);
    } else {
      await set(ref(db, nodeName), obj);
    }
    if (clearEntr) await remove(ref(db, 'Entregas'));

    uploadStatus.textContent = `✅ ${parsedUploadData.length} registros cargados en /${nodeName}.`;
    showToast(`✅ Plantilla cargada: ${parsedUploadData.length} registros en /${nodeName}.`);
    setTimeout(closeModal, 1800);

  } catch (err) {
    console.error(err);
    uploadStatus.textContent = '⚠ Error al cargar: ' + (err.message || err.code || err);
    btnUpload.disabled = false;
  }
});

/* ══════════════════════════════════
   FIREBASE LISTENERS
══════════════════════════════════ */
onValue(ref(db, 'Personal'), snap => {
  const val = snap.val() || {};
  people = Object.entries(val).map(([dni, obj]) => normalizePerson(dni, obj));
  refreshSedeFilter();
  refreshPlanillaFilter();
  refreshMeta();
  searchPeople();
  renderHistory();
  if (modalPersonal.classList.contains('open')) renderPersonalList();
}, err => {
  console.error('Error leyendo Personal:', err);
  showToast('Error leyendo Personal: ' + (err?.code || ''));
});

onValue(ref(db, 'Entregas'), snap => {
  entregas = snap.val() || {};
  refreshMeta();
  searchPeople();
  renderHistory();
}, err => {
  console.error('Error leyendo Entregas:', err);
  showToast('Error leyendo Entregas: ' + (err?.code || ''));
});

/* ══════════════════════════════════
   MODAL GESTIONAR PERSONAL (CRUD)
══════════════════════════════════ */
const modalPersonal              = document.getElementById('modalPersonal');
const btnOpenPersonal            = document.getElementById('btnOpenPersonal');
const btnCloseModalPersonal      = document.getElementById('btnCloseModalPersonal');
const btnAddPerson               = document.getElementById('btnAddPerson');
const addPersonStatus            = document.getElementById('addPersonStatus');
const qPersonal                  = document.getElementById('qPersonal');
const filterPersonalPlanilla     = document.getElementById('filterPersonalPlanilla');
const filterPersonalSede         = document.getElementById('filterPersonalSede');
const personalListCount          = document.getElementById('personalListCount');
const btnClearPersonalFilters    = document.getElementById('btnClearPersonalFilters');
const personalList               = document.getElementById('personalList');
const bulkBar                    = document.getElementById('bulkBar');
const chkSelectAll               = document.getElementById('chkSelectAll');
const selectedCount              = document.getElementById('selectedCount');
const btnDeleteSelected          = document.getElementById('btnDeleteSelected');
const pDni                       = document.getElementById('pDni');
const pNombre                    = document.getElementById('pNombre');
const pPlanilla                  = document.getElementById('pPlanilla');
const pSexo                      = document.getElementById('pSexo');
const pTallas                    = document.getElementById('pTallas');
const pSede                      = document.getElementById('pSede');
const pCumple                    = document.getElementById('pCumple');

function openModalPersonal() {
  modalPersonal.classList.add('open');
  renderPersonalList();
}

function closeModalPersonal() {
  modalPersonal.classList.remove('open');
}

let selectedDnis = new Set();

function getFilteredPersonal() {
  const q    = norm(qPersonal.value);
  const plan = filterPersonalPlanilla.value;
  const sede = filterPersonalSede.value;
  return people.filter(p => {
    if (q    && !`${p.dni} ${p.apellidos_nombres}`.toLowerCase().includes(q)) return false;
    if (plan && p.planilla !== plan) return false;
    if (sede && p.sede    !== sede)  return false;
    return true;
  });
}

function updateBulkBar(filtered) {
  const count = selectedDnis.size;
  bulkBar.style.display       = filtered.length ? 'flex' : 'none';
  selectedCount.textContent   = count ? `${count} seleccionado${count !== 1 ? 's' : ''}` : '';
  btnDeleteSelected.disabled  = count === 0;
  chkSelectAll.checked        = filtered.length > 0 && filtered.every(p => selectedDnis.has(p.dni));
  chkSelectAll.indeterminate  = count > 0 && !chkSelectAll.checked;
}

function renderPersonalList() {
  const filtered = getFilteredPersonal();
  personalListCount.textContent = `${filtered.length} de ${people.length}`;

  if (!filtered.length) {
    personalList.innerHTML = '<p style="padding:12px; color:var(--muted); font-size:0.8rem; margin:0;">Sin resultados.</p>';
    updateBulkBar(filtered);
    return;
  }

  personalList.innerHTML = filtered.map(p => `
    <div class="rowitem${selectedDnis.has(p.dni) ? ' row-selected' : ''}">
      <label style="display:flex; align-items:center; gap:0; margin:0; cursor:pointer; flex-shrink:0;">
        <input type="checkbox" class="chk-row" data-dni="${escapeHtml(p.dni)}"
          ${selectedDnis.has(p.dni) ? 'checked' : ''}
          style="width:16px; height:16px; accent-color:var(--danger); cursor:pointer;" />
      </label>
      <div class="who" style="margin-left:8px;">
        <strong>${escapeHtml(p.apellidos_nombres || '(sin nombre)')}</strong>
        <span>${escapeHtml(p.planilla || '-')} &middot; ${escapeHtml(p.sede || '-')}</span>
      </div>
      <div style="display:flex; gap:6px; align-items:center; flex-shrink:0;">
        <span class="mono">${escapeHtml(p.dni)}</span>
        <button class="btn" style="min-height:34px; padding:5px 10px; font-size:0.76rem;" data-edit="${escapeHtml(p.dni)}">Editar</button>
        <button class="btn danger" style="min-height:34px; padding:5px 10px; font-size:0.76rem;" data-del="${escapeHtml(p.dni)}">Eliminar</button>
      </div>
    </div>
  `).join('');

  personalList.querySelectorAll('.chk-row').forEach(chk => {
    chk.addEventListener('change', () => {
      const dni = chk.getAttribute('data-dni');
      chk.checked ? selectedDnis.add(dni) : selectedDnis.delete(dni);
      chk.closest('.rowitem').classList.toggle('row-selected', chk.checked);
      updateBulkBar(getFilteredPersonal());
    });
  });

  personalList.querySelectorAll('button[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = people.find(x => x.dni === btn.getAttribute('data-edit'));
      if (p) openEditPersonModal(p);
    });
  });

  personalList.querySelectorAll('button[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const dni = btn.getAttribute('data-del');
      const p   = people.find(x => x.dni === dni);
      if (!confirm(`¿Eliminar a ${p?.apellidos_nombres || dni} (DNI: ${dni}) del personal?\nEsta acción no se puede deshacer.`)) return;
      try {
        selectedDnis.delete(dni);
        await remove(ref(db, `Personal/${dni}`));
        showToast(`Persona ${dni} eliminada.`);
      } catch (err) {
        console.error(err);
        showToast('Error al eliminar: ' + (err?.message || err?.code || ''));
      }
    });
  });

  updateBulkBar(filtered);
}

btnOpenPersonal.addEventListener('click', openModalPersonal);

btnCloseModalPersonal.addEventListener('click', closeModalPersonal);
modalPersonal.addEventListener('click', e => { if (e.target === modalPersonal) closeModalPersonal(); });
qPersonal.addEventListener('input', renderPersonalList);
filterPersonalPlanilla.addEventListener('change', renderPersonalList);
filterPersonalSede.addEventListener('change', renderPersonalList);
btnClearPersonalFilters.addEventListener('click', () => {
  qPersonal.value = '';
  filterPersonalPlanilla.value = '';
  filterPersonalSede.value = '';
  renderPersonalList();
});

chkSelectAll.addEventListener('change', () => {
  const filtered = getFilteredPersonal();
  if (chkSelectAll.checked) {
    filtered.forEach(p => selectedDnis.add(p.dni));
  } else {
    filtered.forEach(p => selectedDnis.delete(p.dni));
  }
  renderPersonalList();
});

btnDeleteSelected.addEventListener('click', async () => {
  const toDelete = [...selectedDnis];
  if (!toDelete.length) return;
  if (!confirm(`¿Eliminar ${toDelete.length} persona${toDelete.length !== 1 ? 's' : ''} seleccionada${toDelete.length !== 1 ? 's' : ''}?\nEsta acción no se puede deshacer.`)) return;

  btnDeleteSelected.disabled = true;
  btnDeleteSelected.textContent = 'Eliminando...';
  let errors = 0;
  for (const dni of toDelete) {
    try {
      await remove(ref(db, `Personal/${dni}`));
      selectedDnis.delete(dni);
    } catch (err) {
      console.error(err);
      errors++;
    }
  }
  btnDeleteSelected.textContent = 'Eliminar seleccionados';
  showToast(errors
    ? `Eliminados con ${errors} error(es).`
    : `${toDelete.length} persona${toDelete.length !== 1 ? 's' : ''} eliminada${toDelete.length !== 1 ? 's' : ''}.`
  );
});

/* ── Modal editar persona ── */
const modalEditPerson   = document.getElementById('modalEditPerson');
const btnCloseEditPerson = document.getElementById('btnCloseEditPerson');
const btnCancelEdit     = document.getElementById('btnCancelEdit');
const btnSaveEdit       = document.getElementById('btnSaveEdit');
const editDniLabel      = document.getElementById('editDniLabel');
const editPersonStatus  = document.getElementById('editPersonStatus');
const eName     = document.getElementById('eName');
const ePlanilla = document.getElementById('ePlanilla');
const eSexo     = document.getElementById('eSexo');
const eTallas   = document.getElementById('eTallas');
const eSede     = document.getElementById('eSede');
const eCumple   = document.getElementById('eCumple');

let editingDni = null;

function openEditPersonModal(p) {
  editingDni               = p.dni;
  editDniLabel.textContent = p.dni;
  eName.value              = p.apellidos_nombres;
  eTallas.value            = p.tallas;
  eCumple.value            = p.cumpleanos;
  editPersonStatus.textContent = '';
  setSelectValue(ePlanilla, p.planilla);
  setSelectValue(eSexo,     p.sexo);
  setSelectValue(eSede,     p.sede);
  modalEditPerson.classList.add('open');
}

function setSelectValue(sel, val) {
  const match = Array.from(sel.options).find(o => o.value === val || o.text === val);
  sel.value = match ? match.value : '';
}

function closeEditPersonModal() {
  modalEditPerson.classList.remove('open');
  editingDni = null;
}

btnCloseEditPerson.addEventListener('click', closeEditPersonModal);
btnCancelEdit.addEventListener('click', closeEditPersonModal);
modalEditPerson.addEventListener('click', e => { if (e.target === modalEditPerson) closeEditPersonModal(); });

btnSaveEdit.addEventListener('click', async () => {
  if (!editingDni) return;
  const nombre = eName.value.trim();
  if (!nombre) { editPersonStatus.textContent = '⚠ El nombre es obligatorio.'; return; }

  btnSaveEdit.disabled = true;
  editPersonStatus.textContent = 'Guardando...';
  try {
    const record = {
      APELLIDOS_NOMBRES: nombre,
      PLANILLA:          ePlanilla.value.trim(),
      SEXO:              eSexo.value.trim(),
      TALLAS:            eTallas.value.trim(),
      SEDE:              eSede.value.trim(),
    };
    const cumple = eCumple.value.trim();
    if (cumple) record.CUMPLEANOS = cumple;

    await set(ref(db, `Personal/${editingDni}`), record);
    editPersonStatus.textContent = '✅ Guardado correctamente.';
    setTimeout(closeEditPersonModal, 900);
    showToast(`DNI ${editingDni} actualizado.`);
  } catch (err) {
    console.error(err);
    editPersonStatus.textContent = '⚠ Error: ' + (err?.message || err?.code || '');
  } finally {
    btnSaveEdit.disabled = false;
  }
});

btnAddPerson.addEventListener('click', async () => {
  const dni    = pDni.value.trim();
  const nombre = pNombre.value.trim();

  addPersonStatus.textContent = '';
  if (!dni)    { addPersonStatus.textContent = '⚠ El DNI es obligatorio.'; return; }
  if (!nombre) { addPersonStatus.textContent = '⚠ El nombre es obligatorio.'; return; }
  if (people.find(p => p.dni === dni)) {
    addPersonStatus.textContent = `⚠ DNI ${dni} ya existe en el personal.`;
    return;
  }

  btnAddPerson.disabled = true;
  addPersonStatus.textContent = 'Guardando...';
  try {
    const record = {
      APELLIDOS_NOMBRES: nombre,
      PLANILLA:          pPlanilla.value.trim(),
      SEXO:              pSexo.value.trim(),
      TALLAS:            pTallas.value.trim(),
      SEDE:              pSede.value.trim(),
    };
    const cumple = pCumple.value.trim();
    if (cumple) record.CUMPLEANOS = cumple;

    await set(ref(db, `Personal/${dni}`), record);
    addPersonStatus.textContent = `✅ DNI ${dni} agregado correctamente.`;
    pDni.value = pNombre.value = pPlanilla.value = pSexo.value = pTallas.value = pSede.value = pCumple.value = '';
  } catch (err) {
    console.error(err);
    addPersonStatus.textContent = '⚠ Error al guardar: ' + (err?.message || err?.code || '');
  } finally {
    btnAddPerson.disabled = false;
  }
});
