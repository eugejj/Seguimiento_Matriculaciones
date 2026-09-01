const { chromium } = require('playwright');

(async () => {
  console.log("🚀 Bot iniciado");

  const SHEETS_GET = process.env.SHEETS_GET;
  const SHEETS_POST = process.env.SHEETS_POST;
  const SGA_USER = process.env.SGA_USER;
  const SGA_PASS = process.env.SGA_PASS;

  // 1. TRAER CÓDIGOS
  const res = await fetch(SHEETS_GET, { redirect: 'follow' });
  const codigos = await res.json();
  console.log("📥 códigos cargados:", codigos);

  if (!codigos || codigos.length === 0) {
    console.log("⚠️ No se encontraron códigos para procesar.");
    return;
  }

  // 2. ABRIR NAVEGADOR EN MODO NUBE
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("🌐 Navegando al SGA...");
  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas');
  await page.waitForLoadState('networkidle');

  // 3. AUTENTICACIÓN / LOGIN
  const passInput = page.locator('input[type="password"]');
  if (await passInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log("🔑 Pantalla de login detectada, iniciando sesión...");
    await page.locator('input[type="text"], input[name="username"], input[name="user"]').first().fill(SGA_USER || '');
    await passInput.first().fill(SGA_PASS || '');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
      page.click('button[type="submit"], input[type="submit"], button:has-text("Ingresar")')
    ]);
    console.log("✅ Sesión iniciada.");
  }

  // 4. PROCESAR CÓDIGOS
  for (const codigo of codigos) {
    console.log(`🔎 Buscando: ${codigo}`);
    // Aquí continúa la búsqueda según la estructura del SGA
  }

  await browser.close();
  console.log("🏁 Proceso finalizado.");
})();
