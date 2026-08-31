const puppeteer = require('puppeteer');
const http = require('http');
const { google } = require('googleapis');
const path = require('path');

const SPREADSHEET_ID = '1l06xCPah3B1AdyXzLu7ILoyBINCMI8fFze8ug7bOGls';

async function ejecutarBot(listaCodigosActivos = []) {
  console.log("--------------------------------------------------");
  console.log("📍 [PASO 1] Iniciando función ejecutarBot...");

  let codigosAProcesar = listaCodigosActivos.map(item => {
    if (typeof item === 'object' && item !== null) {
      return String(item.codigo || item.id || Object.values(item)[0] || '').trim();
    }
    return String(item).trim();
  }).filter(Boolean);

  if (codigosAProcesar.length === 0) {
    console.log("⚠️ [PASO 1] No se recibieron códigos válidos.");
    return { status: "OK", guardadosSheets: 0, detalle: "No se recibieron códigos para procesar." };
  }

  console.log(`📍 [PASO 1] Códigos recibidos (${codigosAProcesar.length}):`, codigosAProcesar);

  // 1. Verificar lectura del archivo credentials.json
  console.log("📍 [PASO 2] Verificando credenciales de Google...");
  let auth, sheets;
  try {
    auth = new google.auth.GoogleAuth({
      keyFile: path.join(__dirname, 'credentials.json'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    sheets = google.sheets({ version: 'v4', auth });
    console.log("✅ [PASO 2] Credenciales cargadas correctamente.");
  } catch (errCredentials) {
    console.error("❌ [PASO 2 ERROR] Falló la lectura de credentials.json:", errCredentials.message);
    return { status: "ERROR", message: "Error al leer credentials.json: " + errCredentials.message };
  }

  // 2. Intentar lanzar Puppeteer (Navegador)
  console.log("📍 [PASO 3] Intentando abrir el navegador con Puppeteer...");
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log("✅ [PASO 3] Navegador abierto exitosamente.");
  } catch (errBrowser) {
    console.error("❌ [PASO 3 ERROR] Falló al abrir el navegador Chrome/Puppeteer:", errBrowser.message);
    return { status: "ERROR", message: "Error en Navegador (Puppeteer/Chrome): " + errBrowser.message };
  }

  // 3. Consultar la web del SGA
  const filasAEscribir = [];
  const listaResultados = [];
  
  const ahora = new Date();
  const dia = ahora.getDate().toString().padStart(2, '0');
  const mes = (ahora.getMonth() + 1).toString().padStart(2, '0');
  const hora = ahora.getHours().toString().padStart(2, '0');
  const min = ahora.getMinutes().toString().padStart(2, '0');
  const fechaHora = `${dia}/${mes} ${hora}:${min}`;

  try {
    const page = await browser.newPage();
    console.log("📍 [PASO 4] Navegando a la web del SGA...");
    await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas', { waitUntil: 'networkidle2' });
    console.log("✅ [PASO 4] Página del SGA cargada.");

    for (const codigo of codigosAProcesar) {
      console.log(`🔎 [PASO 5] Buscando código: ${codigo}`);
      
      await page.waitForSelector('input', { visible: true });
      const inputs = await page.$$('input');
      if (inputs.length > 0) {
        await inputs[0].click({ clickCount: 3 });
        await inputs[0].type(codigo);
        await new Promise(r => setTimeout(r, 2000));
      }

      const confirmados = await page.evaluate((cod) => {
        const trs = Array.from(document.querySelectorAll('tr'));
        const filaTarget = trs.find(tr => tr.innerText.includes(cod));
        if (filaTarget) {
          const tds = filaTarget.querySelectorAll('td');
          if (tds.length > 11) {
            return parseInt(tds[11].innerText.trim()) || 0;
          }
        }
        return 0;
      }, codigo);

      console.log(`   👉 Resultado para ${codigo}: ${confirmados} confirmados.`);
      filasAEscribir.push([fechaHora, codigo, confirmados]);
      listaResultados.push(`${codigo}: ${confirmados} confirmados`);
    }

    await browser.close();
    console.log("✅ [PASO 5] Extracción finalizada y navegador cerrado.");

  } catch (errSGA) {
    if (browser) await browser.close();
    console.error("❌ [PASO 4/5 ERROR] Falló durante la navegación en SGA:", errSGA.message);
    return { status: "ERROR", message: "Error leyendo la web del SGA: " + errSGA.message };
  }

  // 4. Escribir resultados en Google Sheets
  console.log("📍 [PASO 6] Intentando guardar datos en Google Sheets...");
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'evolucion!A:C',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: filasAEscribir },
    });
    console.log("🎉 [PASO 6] Datos guardados con éxito en la solapa 'evolucion'.");

    return {
      status: "OK",
      guardadosSheets: filasAEscribir.length,
      detalle: listaResultados.join('\n')
    };

  } catch (errSheets) {
    console.error("❌ [PASO 6 ERROR] Falló al escribir en Google Sheets:", errSheets.message);
    return { status: "ERROR", message: "Error al escribir en Google Sheets: " + errSheets.message };
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
    res.end("Servidor activo ☁️");
  }
}).listen(PORT, () => {
  console.log(`🟢 Servidor escuchando en puerto ${PORT}`);
});