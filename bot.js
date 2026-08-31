const { chromium } = require('playwright-chromium');
const http = require('http');
const { google } = require('googleapis');
const path = require('path');

const SPREADSHEET_ID = '1yk2Lhe39x8M0_JvOi3L50h9HgNGeVJr4JM0C8xLG7zA';

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

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
  console.log("🚀 Iniciando Bot...");

  // Desestructuración segura del payload para extraer texto puro
  const codigosAProcesar = listaCodigosActivos.map(item => {
    if (typeof item === 'object' && item !== null) {
      return String(item.codigo || item.id || Object.values(item)[0] || '').trim();
    }
    return String(item).trim();
  }).filter(c => c.length > 0);

  console.log(`📌 Códigos limpios recibidos: ${codigosAProcesar.length}`);

  if (codigosAProcesar.length === 0) {
    return {
      status: "OK",
      totalEnviados: 0,
      procesadosSGA: 0,
      guardadosSheets: 0,
      message: "Lista de códigos vacía."
    };
  }

  try {
    const browser = await chromium.launch({
      headless: true,
      channel: 'chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas');
    await page.waitForLoadState('networkidle');

    const resultadosEvolucion = [];

    // 1. Búsqueda en SGA
    for (const codigo of codigosAProcesar) {
      console.log(`🔎 Consultando SGA: ${codigo}`);

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
    }

    await browser.close();

    // 2. Consolidación en Google Sheets
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

      const resValores = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${nombreHoja}'!A:ZZ`,
      });

      const filas = resValores.data.values || [];
      if (filas.length < 2) continue;

      let maxCols = 0;
      filas.forEach(f => {
        if (f.length > maxCols) maxCols = f.length;
      });

      const nuevaColumnaNum = maxCols + 1;
      const letraNuevaCol = numeroAColumna(nuevaColumnaNum);

      // Insertar encabezado de fecha
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${nombreHoja}'!${letraNuevaCol}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[encabezadoFecha]] },
      });

      const codigosHoja = filas.map(f => (f[0] ? String(f[0]).trim() : ""));

      informacionHojas.push({
        nombre: nombreHoja,
        letraColumna: letraNuevaCol,
        codigos: codigosHoja
      });
    }

    let guardadosCount = 0;

    // Relacionar códigos e insertar en la matriz
    for (const item of resultadosEvolucion) {
      for (const info of informacionHojas) {
        const indexFila = info.codigos.indexOf(item.codigo);

        if (indexFila !== -1) {
          const numeroFila = indexFila + 1;

          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `'${info.nombre}'!${info.letraColumna}${numeroFila}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[item.confirmados]] },
          });

          guardadosCount++;
          break;
        }
      }
    }

    return {
      status: "OK",
      totalEnviados: listaCodigosActivos.length,
      procesadosSGA: resultadosEvolucion.length,
      guardadosSheets: guardadosCount
    };

  } catch (error) {
    console.error("❌ Error:", error);
    return { status: "ERROR", message: error.message };
  }
}

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
    res.end("Servidor listo ☁️");
  }
}).listen(PORT, () => {
  console.log(`🟢 Servidor escuchando en puerto ${PORT}`);
});