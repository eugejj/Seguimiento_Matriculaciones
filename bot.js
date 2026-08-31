const { chromium } = require('playwright-chromium');
const http = require('http');
const { google } = require('googleapis');
const path = require('path');

// ID de tu planilla destino FINAL
const SPREADSHEET_ID = '1yk2Lhe39x8M0_JvOi3L50h9HgNGeVJr4JM0C8xLG7zA';

// Autenticación con Google Sheets API
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

// Función auxiliar para convertir números de columna a letras de Excel (1->A, 2->B, 27->AA, 55->BC)
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
  console.log("🚀 Bot iniciado: Réplica exacta de 'consolidarEvolucion'...");

  // Normalizar los códigos provenientes del HTML
  const codigosAProcesar = listaCodigosActivos.map(item => {
    if (typeof item === 'object' && item !== null) {
      return String(item.codigo || item.id || Object.values(item)[0] || '').trim();
    }
    return String(item).trim();
  }).filter(c => c.length > 0);

  console.log(`📌 Se procesarán ${codigosAProcesar.length} código(s) activo(s).`);

  try {
    // 1. Iniciar navegador Playwright
    const browser = await chromium.launch({
      headless: true,
      channel: 'chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas');
    await page.waitForLoadState('networkidle');

    // Array para guardar en memoria las descargas de SGA (Equivalente a la hoja 'evolucion')
    const resultadosEvolucion = [];

    // 2. Extraer datos del SGA para cada código activo
    for (const codigo of codigosAProcesar) {
      console.log(`🔎 Buscando en SGA: ${codigo}...`);

      const input = page.locator('input:visible').first();
      await input.fill('');
      await input.fill(codigo);
      await page.waitForTimeout(2000);

      const filasTabla = page.locator('tr', { hasText: codigo });
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

      resultadosEvolucion.push({ codigo: codigo, confirmados: confirmados });
      console.log(`📥 SGA: ${codigo} -> Inscriptos: ${confirmados}`);
    }

    await browser.close();

    if (resultadosEvolucion.length === 0) {
      console.log("⚠️ No se extrajo ningún dato del SGA.");
      return { status: "OK", message: "Sin datos para consolidar." };
    }

    // 3. CONSOLIDAR EN PLANILLA DESTINO (Réplica exacta de consolidarEvolucion)
    console.log("\n📊 Iniciando consolidación en Planilla Destino...");

    const resMetaData = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const hojas = resMetaData.data.sheets;

    const ahora = new Date();
    const dia = ahora.getDate().toString().padStart(2, '0');
    const mes = (ahora.getMonth() + 1).toString().padStart(2, '0');
    const horas = ahora.getHours().toString().padStart(2, '0');
    const minutos = ahora.getMinutes().toString().padStart(2, '0');
    const encabezadoFecha = `${dia}/${mes} ${horas}:${minutos}`;

    const informacionHojas = [];

    for (const sheetObj of hojas) {
      const nombreHoja = sheetObj.properties.title;

      // Obtener datos completos de la hoja
      const resValores = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${nombreHoja}'!A:ZZ`,
      });

      const filas = resValores.data.values || [];
      if (filas.length < 2) continue; // Si no tiene filas, la salteamos

      // Calcular getLastColumn() real
      let maxCols = 0;
      filas.forEach(f => {
        if (f.length > maxCols) maxCols = f.length;
      });

      const nuevaColumnaNum = maxCols + 1; // getLastColumn() + 1
      const letraNuevaCol = numeroAColumna(nuevaColumnaNum);

      // Escribir la cabecera de la fecha en la Fila 1 de la nueva columna
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${nombreHoja}'!${letraNuevaCol}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[encabezadoFecha]] },
      });

      // Mapear códigos de la Columna A de la hoja
      const codigosHoja = filas.map(f => (f[0] ? String(f[0]).trim() : ""));

      informacionHojas.push({
        nombre: nombreHoja,
        letraColumna: letraNuevaCol,
        codigos: codigosHoja
      });
    }

    // 4. Recorrer los resultados descargados y ubicarlos en su respectiva fila y hoja
    let encontrados = 0;

    for (const item of resultadosEvolucion) {
      const codigoBuscado = item.codigo;
      const inscriptos = item.confirmados;

      for (const info of informacionHojas) {
        const indexFila = info.codigos.indexOf(codigoBuscado);

        if (indexFila !== -1) {
          const numeroFila = indexFila + 1;

          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `'${info.nombre}'!${info.letraColumna}${numeroFila}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[inscriptos]] },
          });

          console.log(`✅ ${codigoBuscado} -> ${inscriptos} guardado en [${info.nombre} ! ${info.letraColumna}${numeroFila}]`);
          encontrados++;
          break;
        }
      }
    }

    console.log(`🎉 Consolidación finalizada. Cursos actualizados: ${encontrados}`);
    return { status: "OK" };

  } catch (error) {
    console.error("❌ Error durante el proceso:", error);
    return { status: "ERROR", message: error.message };
  }
}

// Servidor Web para recibir la orden del HTML
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