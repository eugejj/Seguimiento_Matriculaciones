const { chromium } = require('playwright-chromium');
const http = require('http');

const SHEETS_GET = "https://script.google.com/macros/s/AKfycbw5ReP1DrK1zW7Xjn9qJcWlVYivcz0-CxbN3ZAa3Kp6HiVYPMdpA3-XA3vHVMRq2Ste/exec";
const SHEETS_POST = "https://script.google.com/macros/s/AKfycbw5ReP1DrK1zW7Xjn9qJcWlVYivcz0-CxbN3ZAa3Kp6HiVYPMdpA3-XA3vHVMRq2Ste/exec";

async function ejecutarBot() {
  console.log("🚀 Bot iniciado en la Nube");

  try {
    const res = await fetch(SHEETS_GET);
    const codigos = await res.json();

    console.log("📥 Códigos recibidos desde Sheets:", codigos);

    if (!codigos || codigos.length === 0) {
      console.log("⚠️ No hay códigos vigentes para procesar.");
      return { status: "OK", total: 0 };
    }

    // 🧠 Lanzar Chromium en la nube (sin interfaz gráfica)
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas');
    await page.waitForLoadState('networkidle');

    for (const codigoBase of codigos) {
      console.log("\n🔎 Buscando:", codigoBase);

      const input = page.locator('input:visible').first();
      await input.fill('');
      await input.fill(codigoBase);

      await page.waitForTimeout(4000);

      const filas = page.locator('tr', { hasText: codigoBase });
      const count = await filas.count();

      if (count === 0) continue;

      for (let i = 0; i < count; i++) {
        const fila = filas.nth(i);
        const tds = fila.locator('td');
        const columnas = await tds.count();

        if (columnas === 0) continue;

        const codigo = (await tds.nth(1).innerText()).trim();
        let confirmados = "0";

        if (columnas > 11) {
          confirmados = (await tds.nth(11).innerText()).trim();
        }

        console.log({ codigo, confirmados });

        await fetch(SHEETS_POST, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo, confirmados })
        });
      }

      await page.waitForTimeout(1500);
    }

    await browser.close();
    console.log("✅ Proceso finalizado en la nube");
    return { status: "OK" };

  } catch (error) {
    console.error("❌ Error en la ejecución del bot:", error);
    return { status: "ERROR", message: error.message };
  }
}

// 🌐 Servidor para recibir órdenes desde el HTML o ejecutar de entrada
const PORT = process.env.PORT || 3000;
http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.url === '/ejecutar-bot') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const resultado = await ejecutarBot();
    res.end(JSON.stringify(resultado));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end("Servidor de Bot SGA activo en la Nube ☁️");
  }
}).listen(PORT, () => {
  console.log(`🟢 Servidor en la nube listo en puerto ${PORT}`);
});