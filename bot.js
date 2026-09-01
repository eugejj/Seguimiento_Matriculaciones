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

  console.log("🌐 Navegando al SGA...");
  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas');
  await page.waitForLoadState('networkidle');

  // AJUSTE: Si el SGA nos mandó al login por no estar autenticados, se loguea sí o sí
  if (page.url().includes('login')) {
    console.log("🔑 Iniciando sesión...");
    await page.locator('input[type="text"], input[name="username"], input[name="user"]').first().fill(SGA_USER || '');
    await page.locator('input[type="password"]').first().fill(SGA_PASS || '');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
      page.click('button[type="submit"], input[type="submit"], button:has-text("Ingresar")')
    ]);
    console.log("✅ Sesión iniciada.");

    // Volver a propuestas si quedó en otra pantalla
    if (!page.url().includes('propuestas')) {
      await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas');
      await page.waitForLoadState('networkidle');
    }
  }

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
