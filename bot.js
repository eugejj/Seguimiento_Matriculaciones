const { chromium } = require('playwright-chromium');
const http = require('http');
const { google } = require('googleapis');
const path = require('path');

// ID de tu planilla de Google Sheets destino
const SPREADSHEET_ID = '1yk2Lhe39x8M0_JvOi3L50h9HgNGeVJr4JM0C8xLG7zA';

// Autenticación directa con las credenciales de Google
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

async function ejecutarBot() {
  console.log("🚀 Bot iniciado: Procesamiento directo en Google Sheets");

  try {
    // 1. Obtener las pestañas u hojas de la planilla
    const resMetaData = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const hojas = resMetaData.data.sheets;

    // Generar fecha/hora actual (ej. 31/08 15:00)
    const ahora = new Date();
    const fechaEncabezado = `${ahora.getDate().toString().padStart(2, '0')}/${(ahora.getMonth() + 1).toString().padStart(2, '0')} ${ahora.getHours().toString().padStart(2, '0')}:${ahora.getMinutes().toString().padStart(2, '0')}`;

    // 2. Iniciar Chromium en modo headless
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas');
    await page.waitForLoadState('networkidle');

    // 3. Procesar cada hoja de la planilla
    for (const sheetObj of hojas) {
      const nombreHoja = sheetObj.properties.title;
      console.log(`\n📑 Procesando hoja: ${nombreHoja}`);

      // Obtener códigos de la Columna A
      const rangeRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${nombreHoja}'!A:A`,
      });

      const filas = rangeRes.data.values || [];
      if (filas.length < 2) continue; // Ignorar hojas vacías

      const codigos = filas.map(f => (f[0] ? String(f[0]).trim() : ""));

      // Determinar la posición de la nueva columna al final
      const primeraFilaRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${nombreHoja}'!1:1`,
      });
      const numCols = (primeraFilaRes.data.values && primeraFilaRes.data.values[0]) ? primeraFilaRes.data.values[0].length : 1;
      const colNuevaIndex = numCols + 1;

      // Convertir número de columna a letra (ej: 3 -> C)
      function numeroAColumna(n) {
        let str = "";
        while (n > 0) {
          let m = (n - 1) % 26;
          str = String.fromCharCode(65 + m) + str;
          n = Math.floor((n - m) / 26);
        }
        return str;
      }

      const letraColumnaNueva = numeroAColumna(colNuevaIndex);

      // Escribir la fecha y hora en la primera fila de la nueva columna
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${nombreHoja}'!${letraColumnaNueva}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[fechaEncabezado]] },
      });

      // Recorrer los códigos y consultar el SGA
      for (let i = 1; i < codigos.length; i++) {
        const codigo = codigos[i];
        if (!codigo) continue;

        console.log(`🔎 Buscando código: ${codigo}...`);

        const input = page.locator('input:visible').first();
        await input.fill('');
        await input.fill(codigo);
        await page.waitForTimeout(2500);

        const filasTabla = page.locator('tr', { hasText: codigo });
        const count = await filasTabla.count();
        let confirmados = "0";

        if (count > 0) {
          const filaTarget = filasTabla.nth(0);
          const tds = filaTarget.locator('td');
          if ((await tds.count()) > 11) {
            confirmados = (await tds.nth(11).innerText()).trim();
          }
        }

        // Guardar la cantidad directamente en la fila y columna nueva
        const filaNum = i + 1;
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `'${nombreHoja}'!${letraColumnaNueva}${filaNum}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[Number(confirmados)]] },
        });

        console.log(`✅ ${codigo} -> ${confirmados} guardado en ${letraColumnaNueva}${filaNum}`);
      }
    }

    await browser.close();
    console.log("🎉 ¡Proceso finalizado exitosamente en Google Sheets!");
    return { status: "OK" };

  } catch (error) {
    console.error("❌ Error durante la ejecución del bot:", error);
    return { status: "ERROR", message: error.message };
  }
}

// Servidor Web para recibir la orden desde el HTML
const PORT = process.env.PORT || 3000;
http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/ejecutar-bot') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const resultado = await ejecutarBot();
    res.end(JSON.stringify(resultado));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end("Servidor del Bot SGA activo ☁️");
  }
}).listen(PORT, () => {
  console.log(`🟢 Servidor activo en puerto ${PORT}`);
});