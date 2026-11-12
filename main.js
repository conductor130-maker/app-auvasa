let DATOS = { lineas: [] };
let favoritos = JSON.parse(localStorage.getItem('auvasa_favoritos') || '{"grupos":[]}');
let lineaActual = null;
let grupoActual = null;
let cocheIndexActual = 0;
let listaGruposFiltrada = [];
let favoritoPendiente = null;

// ---------- CARGA DE DATOS MÚLTIPLE ----------
async function cargarDatos() {
  const grid = document.getElementById('grid-tipos');
  grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:20px;">Cargando horarios...</p>';
  
  const archivos = [
    'horarios_ordinarias.json',
    'horarios_madrugada.json',
    'horarios_lanzaderas.json',
    'horarios_buho.json',
    'horarios_futbol.json',
    'horarios_personal.json',
    'horarios_manual.json'
  ];

  try {
    let todasLasLineas = [];
    for (const archivo of archivos) {
      try {
        const res = await fetch('./' + archivo + '?v=4'); // El ?v=4 evita problemas de caché
        if (res.ok) {
          const texto = await res.text();
          const json = JSON.parse(texto);
          if (json.lineas && Array.isArray(json.lineas)) {
            todasLasLineas = todasLasLineas.concat(json.lineas);
          }
        }
      } catch (e) { console.warn('Error en ' + archivo + ': ' + e.message); }
    }

    DATOS.lineas = todasLasLineas;
    if (!DATOS.lineas || DATOS.lineas.length === 0) throw new Error('No se pudo cargar ninguna línea.');
    renderTipos();
  } catch (e) {
    grid.innerHTML = '<div style="grid-column:1/-1;padding:20px;background:#fff;color:#E30613;border-radius:10px;"><h3>Error cargando horarios</h3><p>' + e.message + '</p></div>';
  }
}

// ---------- CONFIGURACIÓN DE LOS BOTONES ----------
const TIPOS = [
  { id: 'ordinaria', emoji: '🚌', nombre: 'Líneas Ordinarias' },
  { id: 'matinal', emoji: '🌙', nombre: 'Madrugada' },
  { id: 'laboral', emoji: '🏭', nombre: 'Pruebas' },
  { id: 'buho', emoji: '🦉', nombre: 'Líneas Búho' },
  { id: 'futbol', emoji: '⚽', nombre: 'Fútbol' },
  { id: 'lanzadera', emoji: '🎓', nombre: 'Lanzaderas' },
  { id: 'personal', emoji: '🚐', nombre: 'Personal' },
  { id: 'manual', emoji: '📖', nombre: 'Manual y Normativa' },
  { id: 'gtfs', emoji: '📅', nombre: 'Horarios públicos (GTFS)' },
  { id: 'buses', emoji: '🚍', nombre: 'Buses en directo' }
];

function renderTipos() {
  const grid = document.getElementById('grid-tipos');
  grid.innerHTML = TIPOS.filter(t => ['manual','gtfs','buses'].includes(t.id) || DATOS.lineas.some(l => l && l.tipo === t.id)).map(t =>
    '<button class="boton-tipo tipo-' + t.id + '" onclick="mostrarLineas(\'' + t.id + '\')">' +
      '<span class="emoji">' + t.emoji + '</span><span>' + t.nombre + '</span>' +
    '</button>'
  ).join('');
}

// ---------- NAVEGACIÓN ----------
function irA(id, pushHistory = true) {
  document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
  document.getElementById(id).classList.add('activa');
  window.scrollTo(0, 0);
  if (id === 'pantalla-gtfs' && window.gxInit) window.gxInit();
  if (id === 'pantalla-buses' && window.bxInit) window.bxInit();
  
  const btnFlotante = document.getElementById('btn-volver-flotante');
  if (id === 'pantalla-tipos') {
    btnFlotante.classList.add('oculto');
  } else {
    btnFlotante.classList.remove('oculto');
  }

  if (pushHistory) {
    history.pushState({ pantalla: id }, '', '#' + id);
  }
}

function volverAtras() {
  history.back(); 
}

window.addEventListener('popstate', (event) => {
  if (event.state && event.state.pantalla) {
    irA(event.state.pantalla, false);
  } else {
    irA('pantalla-tipos', false);
  }
});

// ---------- FUNCIONES DE LÍNEAS Y HORARIOS ----------
function mostrarLineas(tipoId) {
  if (tipoId === 'gtfs') { irA('pantalla-gtfs'); return; }
  if (tipoId === 'buses') { irA('pantalla-buses'); return; }
  if (tipoId === 'manual') {
    mostrarManual();
    return;
  }

  const tipo = TIPOS.find(t => t.id === tipoId);
  document.getElementById('titulo-tipo').textContent = tipo.nombre;
  const lineas = DATOS.lineas.filter(l => l && l.tipo === tipoId);
  const grid = document.getElementById('grid-lineas');
  
  if (lineas.length === 0) {
    grid.innerHTML = '<p style="text-align:center;padding:40px;">No hay líneas disponibles.</p>';
  } else {
    grid.innerHTML = lineas.map(l =>
      '<div class="tarjeta-linea">' +
        '<div><span class="num">' + (l.id || '?') + '</span><div class="nombre">' + (l.nombre || 'Sin nombre') + '</div></div>' +
        '<div class="botones-linea">' +
          '<button class="btn-recorrido" onclick="verRecorrido(\'' + l.id + '\')">🗺️ Recorrido</button>' +
          '<button class="btn-horario" onclick="verGruposCoches(\'' + l.id + '\')">⏱️ Horarios</button>' +
        '</div>' +
      '</div>'
    ).join('');
  }
  irA('pantalla-lineas');
}

function verRecorrido(id) {
  const linea = DATOS.lineas.find(l => l.id === id);
  if (!linea) return;
  lineaActual = linea;
  document.getElementById('titulo-recorrido').textContent = 'Línea ' + linea.id + ' – ' + linea.nombre;
  let html = '';
  if(linea.recorridos && Array.isArray(linea.recorridos)) {
    linea.recorridos.forEach(r => {
      html += '<div class="bloque-recorrido"><h3>' + (r.sentido || '') + '</h3><ol>' +
        (r.paradas || []).map(p => '<li>' + p + '</li>').join('') + '</ol></div>';
    });
  }
  if (linea.letreros && linea.letreros.length) {
    html += '<div class="bloque-recorrido"><h3>📟 Letreros CUBE</h3><ul class="lista-letreros">' +
      linea.letreros.map(l => '<li>' + l + '</li>').join('') + '</ul></div>';
  }
  if (linea.notas && linea.notas.length) {
    html += '<div class="bloque-recorrido"><h3>📝 Notas</h3><ul class="lista-notas">' +
      linea.notas.map(n => '<li>' + n + '</li>').join('') + '</ul></div>';
  }
  if (linea.paginaRecorridoPDF) {
    html += '<div class="bloque-recorrido"><a class="btn-pdf" href="libro_horarios.pdf#page=' + linea.paginaRecorridoPDF + '" target="_blank">📄 Ver PDF</a></div>';
  }
  document.getElementById('contenido-recorrido').innerHTML = html;
  irA('pantalla-recorrido');
}

function verGruposCoches(id) {
  const linea = DATOS.lineas.find(l => l.id === id);
  if (!linea) return;
  lineaActual = linea;
  document.getElementById('titulo-horarios').textContent = 'Turnos Línea ' + linea.id;
  document.getElementById('filtros-dia').innerHTML = '';
  
  listaGruposFiltrada = linea.horarios || [];
  const cont = document.getElementById('lista-horarios');
  
  if (!listaGruposFiltrada.length) {
    cont.innerHTML = '<p style="text-align:center;padding:20px;">No hay horarios cargados.</p>';
    irA('pantalla-horarios');
    return;
  }

  cont.innerHTML = listaGruposFiltrada.map((h, i) =>
    '<div class="fila-grupo"><button class="boton-grupo" onclick="abrirGrupo(' + i + ')">' +
      '<div class="grupo-titulo">' + (h.nombre || 'Grupo') + '</div>' +
      '<div class="grupo-sub">' + (h.tipoDia || '') + '</div>' +
      '<div class="grupo-accion">Elegir horario ▶</div>' +
    '</button><button class="estrella-grupo" title="Guardar en favoritos" onclick="guardarGrupoDesdeLista(' + i + ')">⭐</button></div>'
  ).join('');
  
  irA('pantalla-horarios');
}

function abrirGrupo(grupoIndex) {
  const grupo = listaGruposFiltrada[grupoIndex];
  if (!grupo) return;
  grupoActual = grupo;

  let coches = [];
  if (Array.isArray(grupo.cochesDetalle) && grupo.cochesDetalle.length) {
    coches = grupo.cochesDetalle;
  } else if (Array.isArray(grupo.salidas) && grupo.salidas.length) {
    coches = grupo.salidas.map(function (s, i) {
      return {
        nombre: s.horario || ('Horario ' + (i + 1)),
        primeraSalida: s.hora || '—',
        retirada: grupo.retirada || '',
        salidas: [{ cabecera: s.cabecera, hora: s.hora }],
        _incompleto: true
      };
    });
  }

  grupoActual.cochesDetalle = coches;
  document.getElementById('titulo-coches').textContent = 'Línea ' + lineaActual.id + ' · ' + (grupo.nombre || '');

  if (!coches.length) {
    document.getElementById('lista-coches').innerHTML = '<div style="padding:20px;text-align:center;">No hay turnos cargados.</div>';
    irA('pantalla-coches');
    return;
  }

  const lista = document.getElementById('lista-coches');
  let html = coches.map((coche, i) =>
    '<button class="btn-coche" onclick="verDetalleCoche(' + i + ')">' +
      '<div class="info-coche">' +
        '<span class="titulo-coche">' + (coche.nombre || '') + '</span>' +
        '<span class="retirada">' + (coche.retirada || '') + '</span>' +
      '</div>' +
      '<span class="primera">' + (coche.primeraSalida || '—') + '</span>' +
    '</button>'
  ).join('');

  html += `
    <button class="btn-fav" style="margin-top: 20px; padding: 16px; font-size: 1.1rem; width: 100%; border-radius: 12px; border: none; cursor: pointer; background: var(--amarillo); color: #1A1A1A; font-weight: bold;" onclick="guardarGrupoFavorito()">
      ⭐ Guardar este grupo entero en Mis Turnos
    </button>
  `;

  lista.innerHTML = html;
  irA('pantalla-coches');
}

function escHtml(t) {
  return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Hora con sus marcas: descanso (negrita y subrayado), asterisco y nota de la celda
function fmtHora(s) {
  if (!s) return '';
  let h = escHtml((s.asterisco ? '*' : '') + (s.hora || '') + (s.asterisco ? '*' : ''));
  if (s.descanso) h = '<span class="hora-descanso">' + h + '</span>';
  if (s.nota) h += '<small class="nota-hora">' + escHtml(s.nota) + '</small>';
  return h;
}

function verDetalleCoche(cocheIndex) {
  cocheIndexActual = cocheIndex;
  const coche = grupoActual.cochesDetalle[cocheIndex];
  if (!coche) return;
  const cont = document.getElementById('detalle-horario');

  const primera = coche.salidas && coche.salidas[0];
  const ultima = coche.salidas && coche.salidas[coche.salidas.length - 1];
  const incompleto = coche._incompleto || (coche.salidas && coche.salidas.length <= 1);

  let html = '';

  if (incompleto) {
    html += '<div style="background:#FFF4E0;border-left:4px solid #F39200;padding:14px;border-radius:10px;margin-bottom:16px;font-size:0.9rem;color:#6B4A00;">' +
      '<b>⚠️ Turno incompleto en la app.</b><br>Consulta el PDF oficial para ver todas las salidas de este coche.</div>';
  }

  html += '<div class="tarjeta-principal">' +
    '<h3>L' + lineaActual.id + ' · ' + (grupoActual.nombre || '') + ' · ' + (coche.nombre || '') + '</h3>' +
    '<div class="sub">' + (grupoActual.tipoDia || '') + '</div>' +
    '<div class="dato"><span>Primera salida</span><strong>' + (primera ? primera.hora + ' (' + primera.cabecera + ')' : '—') + '</strong></div>' +
    '<div class="dato"><span>Última salida</span><strong>' + (ultima ? ultima.hora + ' (' + ultima.cabecera + ')' : '—') + '</strong></div>' +
    '<div class="dato"><span>Retirada</span><strong>' + (coche.retirada || '—') + '</strong></div>' +
  '</div>';

  const total = grupoActual.cochesDetalle.length;
  html += '<div class="nav-horarios">' +
    '<button ' + (cocheIndex === 0 ? 'disabled' : '') + ' onclick="verDetalleCoche(' + (cocheIndex - 1) + ')">◀ Anterior</button>' +
    '<button ' + (cocheIndex === total - 1 ? 'disabled' : '') + ' onclick="verDetalleCoche(' + (cocheIndex + 1) + ')">Siguiente ▶</button>' +
  '</div>';

  if (coche.salidas && coche.salidas.length > 1) {
    const cabeceras = [];
    coche.salidas.forEach(s => { if (cabeceras.indexOf(s.cabecera) === -1) cabeceras.push(s.cabecera); });

    if (cabeceras.length === 2) {
      const col1 = cabeceras[0], col2 = cabeceras[1];
      const filas1 = coche.salidas.filter(s => s.cabecera === col1);
      const filas2 = coche.salidas.filter(s => s.cabecera === col2);
      const maxFilas = Math.max(filas1.length, filas2.length);
      html += '<table class="tabla-pdf"><thead><tr><th>' + col1 + '</th><th>' + col2 + '</th></tr></thead><tbody>';
      for (let i = 0; i < maxFilas; i++) {
        html += '<tr><td>' + (fmtHora(filas1[i])) + '</td><td>' + (fmtHora(filas2[i])) + '</td></tr>';
      }
      html += '</tbody></table>';
    } else {
      html += '<table class="tabla-pdf"><thead><tr><th>Cabecera</th><th>Hora</th></tr></thead><tbody>' +
        coche.salidas.map(s => '<tr><td>' + (s.cabecera || '') + '</td><td>' + fmtHora(s) + '</td></tr>').join('') + '</tbody></table>';
    }
  }

  const todas = coche.salidas || [];
  if (todas.some(s => s.descanso) && grupoActual.descanso && grupoActual.descanso !== '—') {
    html += '<p class="leyenda">Negrita y subrayado: tiempo de descanso en cabecera incluido (' + escHtml(grupoActual.descanso) + ').</p>';
  }
  if (todas.some(s => s.asterisco)) {
    html += '<p class="leyenda">* Las horas con asterisco se explican en las notas.</p>';
  }
  if (grupoActual.notas && grupoActual.notas.length) {
    html += '<div class="bloque-recorrido"><h3>📝 Notas</h3><ul class="lista-notas">' +
      grupoActual.notas.map(n => '<li>' + escHtml(n) + '</li>').join('') + '</ul></div>';
  }

  html += '<div class="acciones-detalle">' +
    '<button class="btn-fav" onclick="abrirModalFavorito()">⭐ Guardar este turno específico</button>' +
    (grupoActual.paginaPDF ? '<a class="btn-pdf-detalle" href="libro_horarios.pdf#page=' + grupoActual.paginaPDF + '" target="_blank">📄 Ver PDF</a>' : '') +
  '</div>';

  cont.innerHTML = html;
  irA('pantalla-detalle');
}

function guardarGrupoFavorito() {
  favoritoPendiente = {
    lineaId: lineaActual.id, lineaNombre: lineaActual.nombre,
    grupo: grupoActual.nombre,
    coche: null,
    tipoDia: grupoActual.tipoDia,
    paginaPDF: grupoActual.paginaPDF || null,
    primeraSalida: null
  };
  
  document.getElementById('modalFavorito').classList.remove('oculto');
  document.getElementById('nombreGrupo').value = '';
  pintarGruposExistentes();
}

// ---------- LÓGICA DEL MANUAL ----------
function mostrarManual() {
  const manual = DATOS.lineas.find(l => l.tipo === 'manual');
  
  if (!manual) {
    document.getElementById('lista-manual').innerHTML = '<p>No hay datos de manual cargados.</p>';
    irA('pantalla-manual');
    return;
  }

  let htmlBotones = '';
  if (manual.recorridos && manual.recorridos.length > 0) {
    manual.recorridos.forEach((bloque, i) => {
      htmlBotones += `<button class="btn-manual" onclick="verManualDetalle(${i})">📄 ${bloque.sentido || 'Sección ' + (i+1)}</button>`;
    });
  } else {
    htmlBotones = '<p>No hay secciones en el manual.</p>';
  }

  document.getElementById('lista-manual').innerHTML = htmlBotones;
  document.getElementById('contenido-manual').innerHTML = '<p style="color:var(--texto-secundario);">Selecciona una sección para ver el contenido.</p>';
  irA('pantalla-manual');
}

function verManualDetalle(index) {
  const manual = DATOS.lineas.find(l => l.tipo === 'manual');
  if (!manual || !manual.recorridos || !manual.recorridos[index]) return;

  const bloque = manual.recorridos[index];
  let html = `<h3 style="color:var(--azul); margin-bottom: 10px;">${bloque.sentido}</h3>`;
  html += `<ul style="padding-left: 20px; line-height: 1.8;">`;
  if (bloque.paradas) {
    bloque.paradas.forEach(texto => {
      html += `<li>${texto}</li>`;
    });
  }
  html += `</ul>`;

  document.getElementById('contenido-manual').innerHTML = html;
  document.getElementById('contenido-manual').scrollIntoView({ behavior: 'smooth' });
}

// ---------- FAVORITOS Y BUSCADOR ----------
function abrirModalFavorito() {
  favoritoPendiente = {
    lineaId: lineaActual.id, lineaNombre: lineaActual.nombre,
    grupo: grupoActual.nombre,
    coche: grupoActual.cochesDetalle[cocheIndexActual].nombre,
    tipoDia: grupoActual.tipoDia,
    paginaPDF: grupoActual.paginaPDF || null,
    primeraSalida: grupoActual.cochesDetalle[cocheIndexActual].primeraSalida
  };
  document.getElementById('modalFavorito').classList.remove('oculto');
  document.getElementById('nombreGrupo').value = '';
  pintarGruposExistentes();
}

function cerrarModal() { document.getElementById('modalFavorito').classList.add('oculto'); }

function pintarGruposExistentes() {
  const f = favoritoPendiente || {};
  const info = document.getElementById('favInfo');
  if (info) info.textContent = 'L' + f.lineaId + ' · ' + (f.grupo || '') + (f.coche ? ' · ' + f.coche : ' · grupo completo');
  const cont = document.getElementById('gruposExistentes');
  cont.innerHTML = '';
  favoritos.grupos.forEach(g => {
    const s = document.createElement('span');
    s.className = 'grupo-opcion';
    s.textContent = g.nombre;
    s.onclick = () => {
      document.getElementById('nombreGrupo').value = g.nombre;
      cont.querySelectorAll('.grupo-opcion').forEach(x => x.classList.remove('seleccionado'));
      s.classList.add('seleccionado');
    };
    cont.appendChild(s);
  });
}

function guardarGrupoDesdeLista(i) {
  grupoActual = listaGruposFiltrada[i];
  guardarGrupoFavorito();
}

function exportarFavoritos() {
  const datos = { version: 1, favoritos: favoritos,
    paradas: JSON.parse(localStorage.getItem('auvasa_stops_fav') || '[]'),
    ajustes: { base: localStorage.getItem('auvasa_rt_base') || '', segundos: localStorage.getItem('auvasa_rt_secs') || '5' } };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 1)], { type: 'application/json' }));
  a.download = 'auvasa-favoritos-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
async function importarFavoritos(archivo) {
  try {
    const d = JSON.parse(await archivo.text());
    if (!d.favoritos || !Array.isArray(d.favoritos.grupos)) throw new Error('el archivo no tiene el formato esperado');
    if (!confirm('¿Sustituir tus favoritos actuales por los de la copia?')) return;
    favoritos = d.favoritos; guardarFavs();
    if (Array.isArray(d.paradas)) localStorage.setItem('auvasa_stops_fav', JSON.stringify(d.paradas));
    if (d.ajustes && d.ajustes.base) localStorage.setItem('auvasa_rt_base', d.ajustes.base);
    if (d.ajustes && d.ajustes.segundos) localStorage.setItem('auvasa_rt_secs', d.ajustes.segundos);
    renderFavoritos(); alert('Copia restaurada.');
  } catch (e) { alert('No se pudo restaurar la copia: ' + e.message); }
}

function guardarFavs() { localStorage.setItem('auvasa_favoritos', JSON.stringify(favoritos)); }

function guardarFavorito() {
  const nombre = document.getElementById('nombreGrupo').value.trim();
  if (!nombre) { document.getElementById('nombreGrupo').focus(); return; }
  let carpeta = favoritos.grupos.find(g => g.nombre.toLowerCase() === nombre.toLowerCase());
  if (!carpeta) { carpeta = { nombre: nombre, horarios: [] }; favoritos.grupos.push(carpeta); }
  const f = favoritoPendiente;
  const repetido = carpeta.horarios.some(h => h.lineaId === f.lineaId && h.grupo === f.grupo && (h.coche || null) === (f.coche || null));
  cerrarModal();
  if (repetido) { alert('Ya estaba guardado en ' + carpeta.nombre); return; }
  carpeta.horarios.push(f);
  guardarFavs();
  alert('Guardado en ' + carpeta.nombre);
}

function renderFavoritos() {
  const cont = document.getElementById('contenido-favoritos');
  cont.innerHTML = '';
  if (!favoritos.grupos.length) {
    cont.innerHTML = '<p style="text-align:center;padding:40px;">Aún no hay favoritos.<br>Pulsa ⭐ junto a un horario para guardarlo.</p>';
    return;
  }
  favoritos.grupos.forEach((g, gi) => {
    const caja = document.createElement('div'); caja.className = 'grupo-favoritos';
    const cab = document.createElement('div'); cab.className = 'fav-cab';
    const h3 = document.createElement('h3'); h3.textContent = '📁 ' + g.nombre; cab.appendChild(h3);
    const del = document.createElement('button'); del.className = 'fav-borrar'; del.textContent = '🗑️ Carpeta';
    del.onclick = () => { if (confirm('¿Borrar la carpeta "' + g.nombre + '" y todo lo que contiene?')) { favoritos.grupos.splice(gi, 1); guardarFavs(); renderFavoritos(); } };
    cab.appendChild(del); caja.appendChild(cab);
    g.horarios.forEach((f, fi) => {
      const fila = document.createElement('div'); fila.className = 'favorito-item';
      const ir = document.createElement('button'); ir.className = 'fav-ir';
      const b = document.createElement('b'); b.textContent = 'L' + f.lineaId + ' · ' + (f.grupo || '') + (f.coche ? ' · ' + f.coche : '');
      const sm = document.createElement('small'); sm.textContent = f.tipoDia || '';
      ir.appendChild(b); ir.appendChild(sm);
      ir.onclick = () => abrirFavorito(f);
      const x = document.createElement('button'); x.textContent = '🗑️'; x.title = 'Quitar';
      x.onclick = () => { g.horarios.splice(fi, 1); if (!g.horarios.length) favoritos.grupos.splice(gi, 1); guardarFavs(); renderFavoritos(); };
      fila.appendChild(ir); fila.appendChild(x); caja.appendChild(fila);
    });
    cont.appendChild(caja);
  });
}

function abrirFavorito(f) {
  const linea = DATOS.lineas.find(l => l && l.id === f.lineaId);
  let idx = linea ? (linea.horarios || []).findIndex(h => h.nombre === f.grupo && (!f.tipoDia || h.tipoDia === f.tipoDia)) : -1;
  if (idx < 0 && linea && f.paginaPDF) idx = (linea.horarios || []).findIndex(h => h.paginaPDF === f.paginaPDF);
  if (idx < 0) { alert('Este horario ya no existe en los datos. Bórralo y vuelve a guardarlo.'); return; }
  lineaActual = linea;
  listaGruposFiltrada = linea.horarios;
  abrirGrupo(idx);
  if (f.coche) {
    const c = grupoActual.cochesDetalle.findIndex(x => x.nombre === f.coche);
    if (c >= 0) verDetalleCoche(c);
  }
}

function buscar(t) {
  if (!t) { document.getElementById('resultadosBusqueda').innerHTML = ''; return; }
  const cont = document.getElementById('resultadosBusqueda');
  if (!DATOS.lineas) return;
  const res = DATOS.lineas.filter(l => l && (l.id.toLowerCase().includes(t.toLowerCase()) || l.nombre.toLowerCase().includes(t.toLowerCase())));
  cont.innerHTML = res.map(l => '<div class="resultado" onclick="document.getElementById(\'barraBusqueda\').classList.add(\'oculto\'); verRecorrido(\'' + l.id + '\')">Línea ' + l.id + ' - ' + l.nombre + '</div>').join('');
}

document.addEventListener('DOMContentLoaded', function () {
  if (localStorage.getItem('auvasa_dark') === '1') document.body.classList.add('dark');
  document.getElementById('btnOscuro').addEventListener('click', function() {
    document.body.classList.toggle('dark');
    localStorage.setItem('auvasa_dark', document.body.classList.contains('dark') ? '1' : '0');
  });
  document.getElementById('btnBuscar').addEventListener('click', function() { document.getElementById('barraBusqueda').classList.toggle('oculto'); });
  document.getElementById('inputBusqueda').addEventListener('input', function(e) { buscar(e.target.value); });
  document.getElementById('btnFavoritos').addEventListener('click', function() { renderFavoritos(); irA('pantalla-favoritos'); });
  
  cargarDatos();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
});