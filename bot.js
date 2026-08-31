const puppeteer = require('puppeteer');
const http = require('http');
const { google } = require('googleapis');
const path = require('path');

// ID de tu planilla origen
const SPREADSHEET_ID = '1l06xCPah3B1AdyXzLu7ILoyBINCMI8fFze8ug7bOGls';

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

async function ejecutarBot(listaCodigosActivos = []) {
  console.log("🚀 Iniciando extracción de SGA...");

  let codigosAProcesar = listaCodigosActivos.map(item => {
    if (typeof item === 'object' && item !== null) {
      return String(item.codigo || item.id || Object.values(item)[0] || '').trim();
    }
    return String(item).trim();
  }).filter(Boolean);

  if (codigosAProcesar.length === 0) {
    return { status: "OK", guardadosSheets: 0, detalle: "No se recibieron códigos para procesar." };
  }

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas', { waitUntil: 'networkidle2' });

    const filasAEscribir = [];
    const listaResultados = [];
    
    // Generar timestamp con formato DD/MM HH:mm
    const ahora = new Date();
    const dia = ahora.getDate().toString().padStart(2, '0');
    const mes = (ahora.getMonth() + 1).toString().padStart(2, '0');
    const hora = ahora.getHours().toString().padStart(2, '0');
    const min = ahora.getMinutes().toString().padStart(2, '0');
    const fechaHora = `${dia}/${mes} ${hora}:${min}`;

    for (const codigo of codigosAProcesar) {
      console.log(`🔎 Consultando en SGA: ${codigo}`);
      
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

      // Fila: [Fecha/Hora, Código, Confirmados]
      filasAEscribir.push([fechaHora, codigo, confirmados]);
      listaResultados.push(`${codigo}: ${confirmados} confirmados`);
    }

    await browser.close();

    // Guardar los datos en la solapa 'evolucion' empezando desde la columna A
    console.log("✍️ Guardando en la hoja evolucion...");
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'evolucion!A:C',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: filasAEscribir },
    });

    return {
      status: "OK",
      guardadosSheets: filasAEscribir.length,
      detalle: listaResultados.join('\n')
    };

  } catch (error) {
    console.error("❌ Error en servidor:", error);
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
    res.end("Servidor activo ☁️");
  }
}).listen(PORT, () => {
  console.log(`🟢 Servidor escuchando en puerto ${PORT}`);
});