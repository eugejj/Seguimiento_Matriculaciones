const { chromium } = require('playwright');

(async () => {
  console.log("🚀 Bot iniciado");

  const SHEETS_GET = process.env.SHEETS_GET;
  const SHEETS_POST = process.env.SHEETS_POST;
  const SGA_USER = process.env.SGA_USER;
  const SGA_PASS = process.env.SGA_PASS;

  // 1. LEER CÓDIGOS DE LA PLANILLA
  const res = await fetch(SHEETS_GET, { redirect: 'follow' });
  const codigos = await res.json();
  console.log("📥 Códigos cargados:", codigos);

  if (!codigos || codigos.length === 0) {
    console.log("⚠️ No se encontraron códigos.");
    return;
  }

  // 2. NAVEGADOR Y LOGIN AUTOMÁTICO
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("🌐 Navegando al login del SGA...");
  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  console.log("🔑 Iniciando sesión...");
  await page.fill('input[type="text"], input[name="username"], input[name="user"]', SGA_USER || '');
  await page.fill('input[type="password"]', SGA_PASS || '');
  await page.click('button[type="submit"], input[type="submit"], button:has-text("Ingresar")');
  
  await page.waitForTimeout(5000);

  console.log("🌐 Navegando a la sección de propuestas...");
  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas', { waitUntil: 'networkidle' });
  await page.waitForSelector('input[type="search"], input[placeholder*="Buscar"], input.form-control', { timeout: 30000 });
  console.log("✅ Sesión iniciada y buscador cargado.");

  // 3. EXTRAER DATOS DEL SGA
  const resultados = [];

  for (const codigo of codigos) {
    console.log(`🔎 Buscando: ${codigo}`);
    try {
      const searchInput = page.locator('input[type="search"], input[placeholder*="Buscar"], input.form-control').first();
      await searchInput.fill(codigo);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);

      const celdaDato = page.locator('table tbody tr:first-child td').last();
      const valorExtraido = await celdaDato.innerText().catch(() => "0");

      resultados.push({
        codigo: codigo,
        confirmados: Number(valorExtraido.trim()) || 0
      });

      console.log(`    └> Extraído: ${valorExtraido.trim()}`);
    } catch (err) {
      console.log(`    ❌ Error en ${codigo}: ${err.message}`);
      resultados.push({ codigo: codigo, confirmados: 0 });
    }
  }

  await browser.close();

  // 4. ENVIAR DIRECTO A LA PLANILLA DESTINO
  if (SHEETS_POST && resultados.length > 0) {
    console.log("📤 Enviando datos a Google Sheets...");
    const respuestaPost = await fetch(SHEETS_POST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'follow',
      body: JSON.stringify(resultados)
    });
    console.log("✅ Resultado:", await respuestaPost.text());
  }

  console.log("🏁 Proceso finalizado con éxito.");
})();
