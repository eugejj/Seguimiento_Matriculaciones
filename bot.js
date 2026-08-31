const { chromium } = require('playwright-chromium');
const http = require('http');
const { google } = require('googleapis');
const path = require('path');

// ID de la planilla que se ve en tu captura de pantalla
const SPREADSHEET_ID = '1l06xCPah3B1AdyXzLu7ILoyBINCMI8fFze8ug7bOGls';

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

async function ejecutarBot(listaCodigosActivos = []) {
  console.log("🚀 Bot iniciado...");

  let codigosAProcesar = listaCodigosActivos.map(item => {
    if (typeof item === 'object' && item !== null) {
      return String(item.codigo || item.id || Object.values(item)[0] || '').trim();
    }
    return String(item).trim();
  }).filter(Boolean);

  try {
    // Si no vinieron códigos desde el botón, los lee de 'buscar_codigo'
    if (codigosAProcesar.length === 0) {
      console.log("📖 Leyendo directamente de la pestaña buscar_codigo...");
      const resEntrada = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'buscar_codigo!A2:A',
      });
      const filas = resEntrada.data.values || [];
      codigosAProcesar = filas.flat().map(c => String(c).trim()).filter(Boolean);
    }

    console.log(`📌 Códigos a procesar: ${codigosAProcesar.length}`);

    if (codigosAProcesar.length === 0) {
      return { status: "OK", guardadosSheets: 0, message: "No hay códigos para procesar." };
    }

    // 1. Extraer datos del SGA
    const browser = await chromium.launch({
      headless: true,
      channel: 'chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas');
    await page.waitForLoadState('networkidle');

    const filasAEscribir = [];
    const ahora = new Date();
    const fechaHora = `${ahora.getDate().toString().padStart(2, '0')}/${(ahora.getMonth() + 1).toString().padStart(2, '0')} ${ahora.getHours().toString().padStart(2, '0')}:${ahora.getMinutes().toString().padStart(2, '0')}`;

    for (const codigo of codigosAProcesar) {
      console.log(`🔎 Consultando SGA para: ${codigo}`);

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

      filasAEscribir.push([fechaHora, codigo, confirmados]);
    }

    await browser.close();

    // 2. Escribir en la pestaña 'evolucion'
    console.log("✍️ Guardando en la pestaña 'evolucion'...");
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'evolucion!A:C',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: filasAEscribir },
    });

    return {
      status: "OK",
      guardadosSheets: filasAEscribir.length,
      detalle: filasAEscribir.map(f => `${f[1]}: ${f[2]}`).join(', ')
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