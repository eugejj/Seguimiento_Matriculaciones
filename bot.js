const { chromium } = require('playwright-chromium');
const http = require('http');
const { google } = require('googleapis');
const path = require('path');

// ID de tu planilla destino FINAL
const SPREADSHEET_ID = '1yk2Lhe39x8M0_JvOi3L50h9HgNGeVJr4JM0C8xLG7zA';

// Autenticación de Google con credentials.json
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

// Función auxiliar para convertir números de columna a letras (1->A, 2->B, 27->AA)
function numeroAColumna(n) {
  let str = "";
  while (n > 0) {
    let m = (n - 1) % 26;
    str = String.fromCharCode(65 + m) + str;
    n = Math.floor((n - m) / 26);
  }
  return str;
}

async function ejecutarBot(listaCodigosActivos = []) {
  console.log("🚀 Bot iniciado: Procesamiento directo a Planilla Final...");

  // Normalizar los códigos provenientes de la hoja 'evolucion'
  const codigosPermitidos = listaCodigosActivos.map(item => {
    if (typeof item === 'object' && item !== null) {
      return String(item.codigo || item.id || Object.values(item)[0] || '').trim().toLowerCase();
    }
    return String(item).trim().toLowerCase();
  }).filter(c => c.length > 0);

  console.log(`📌 Recibidos ${codigosPermitidos.length} código(s) activo(s) para procesar.`);

  try {
    // 1. Obtener todas las hojas/pestañas de la planilla final
    const resMetaData = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const hojas = resMetaData.data.sheets;

    // Generar formato de Fecha/Hora para el encabezado
    const ahora = new Date();
    const fechaEncabezado = `${ahora.getDate().toString().padStart(2, '0')}/${(ahora.getMonth() + 1).toString().padStart(2, '0')} ${ahora.getHours().toString().padStart(2, '0')}:${ahora.getMinutes().toString().padStart(2, '0')}`;

    // 2. Iniciar navegador Playwright
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas');
    await page.waitForLoadState('networkidle');

    // 3. Recorrer cada pestaña de la planilla final
    for (const sheetObj of hojas) {
      const nombreHoja = sheetObj.properties.title;
      console.log(`\n📑 Analizando pestaña: ${nombreHoja}`);

      // Obtener la fila 1 para buscar o crear la columna del día (Lógica tipo Apps Script)
      const resFila1 = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${nombreHoja}'!1:1`,
      });

      const encabezados = (resFila1.data.values && resFila1.data.values[0]) ? resFila1.data.values[0] : [];
      let colTargetIndex = encabezados.length + 1; // Por defecto la primera vacía al final

      // Verificar si la última columna ya tiene el encabezado de hoy
      if (encabezados.length > 0 && encabezados[encabezados.length - 1].startsWith(fechaEncabezado.split(' ')[0])) {
        colTargetIndex = encabezados.length;
      } else {
        // Escribir la nueva cabecera con Fecha y Hora
        const letraColNueva = numeroAColumna(colTargetIndex);
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `'${nombreHoja}'!${letraColNueva}1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[fechaEncabezado]] },
        });
      }

      const letraColumnaFinal = numeroAColumna(colTargetIndex);

      // Obtener los códigos de la Columna A en esta pestaña
      const resColA = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${nombreHoja}'!A:A`,
      });

      const filasColA = resColA.data.values || [];
      if (filasColA.length < 2) continue; // Pestaña vacía

      // Recorrer los códigos de la pestaña
      for (let i = 1; i < filasColA.length; i++) {
        const codigoPlanilla = filasColA[i][0] ? String(filasColA[i][0]).trim() : "";
        if (!codigoPlanilla) continue;

        const codigoLwr = codigoPlanilla.toLowerCase();

        // Si se pasaron códigos desde 'evolución', procesar solo los coincidentes
        if (codigosPermitidos.length > 0 && !codigosPermitidos.includes(codigoLwr)) {
          continue; 
        }

        console.log(`🔎 Extrayendo SGA para: ${codigoPlanilla}...`);

        const input = page.locator('input:visible').first();
        await input.fill('');
        await input.fill(codigoPlanilla);
        await page.waitForTimeout(2500);

        const filasTabla = page.locator('tr', { hasText: codigoPlanilla });
        const count = await filasTabla.count();
        let confirmados = 0;

        if (count > 0) {
          const filaTarget = filasTabla.nth(0);
          const tds = filaTarget.locator('td');
          if ((await tds.count()) > 11) {
            const val = (await tds.nth(11).innerText()).trim();
            confirmados = Number(val) || 0;
          }
        }

        const filaNumero = i + 1;
        // Guardar la cifra directamente en la pestaña y celda correspondiente
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `'${nombreHoja}'!${letraColumnaFinal}${filaNumero}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[confirmados]] },
        });

        console.log(`✅ Guardado: ${codigoPlanilla} -> ${confirmados} en [${nombreHoja} - ${letraColumnaFinal}${filaNumero}]`);
      }
    }

    await browser.close();
    console.log("🎉 ¡Proceso finalizado exitosamente en Google Sheets!");
    return { status: "OK" };

  } catch (error) {
    console.error("❌ Error durante el proceso:", error);
    return { status: "ERROR", message: error.message };
  }
}

// Servidor Web para recibir la llamada del HTML
const PORT = process.env.PORT || 3000;
http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/ejecutar-bot') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      let codigos = [];
      try {
        if (body) {
          const parsed = JSON.parse(body);
          codigos = parsed.codigos || [];
        }
      } catch (e) {}

      res.writeHead(200, { 'Content-Type': 'application/json' });
      const resultado = await ejecutarBot(codigos);
      res.end(JSON.stringify(resultado));
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end("Servidor activo y listo ☁️");
  }
}).listen(PORT, () => {
  console.log(`🟢 Servidor escuchando en puerto ${PORT}`);
});