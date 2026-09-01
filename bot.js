const { chromium } = require('playwright');

(async () => {
  console.log('Iniciando navegador en Render...');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 }
  });

  const page = await context.newPage();

  // Extendemos el timeout por defecto a 60 segundos para evitar errores en la nube
  page.setDefaultTimeout(60000);

  try {
    // 1. Obtener los códigos pendientes desde Google Sheets
    console.log('Obteniendo lista de códigos desde Google Sheets...');
    const responseGet = await fetch(process.env.SHEETS_GET);
    const codigos = await responseGet.json();
    console.log('Códigos a procesar:', codigos);

    if (!codigos || codigos.length === 0) {
      console.log('No hay códigos para procesar.');
      return;
    }

    // 2. Ingresar al SGA
    console.log('Navegando al SGA...');
    await page.goto('https://sga.tuinstitucion.edu.ar', { waitUntil: 'networkidle', timeout: 60000 });

    // 3. Esperar que los campos de login estén totalmente visibles
    console.log('Esperando el formulario de ingreso...');
    await page.waitForSelector('input:visible', { state: 'visible', timeout: 60000 });

    // Login usando credenciales de las variables de entorno
    const usuario = process.env.SGA_USER;
    const contrasena = process.env.SGA_PASS;

    if (!usuario || !contrasena) {
      throw new Error('Faltan configurar SGA_USER o SGA_PASS en las Variables de Entorno.');
    }

    console.log('Ingresando usuario y contraseña...');
    await page.fill('input[type="text"], input[name="username"], input[name="user"], input:visible', usuario);
    await page.fill('input[type="password"], input[name="password"], input:visible', contrasena);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.click('button[type="submit"], input[type="submit"], button:has-text("Ingresar"), button:has-text("Iniciar")')
    ]);

    console.log('Login exitoso. Iniciando búsqueda de códigos...');

    // 4. Bucle para procesar cada código en el SGA
    const resultados = [];
    for (const codigo of codigos) {
      console.log(`Buscando datos para el código: ${codigo}`);

      // Esperar a que el buscador del SGA esté listo
      await page.waitForSelector('input:visible', { state: 'visible', timeout: 60000 });
      await page.fill('input:visible', codigo);
      await page.keyboard.press('Enter');

      await page.waitForTimeout(3000); // Pequeña pausa para asegurar la carga de la tabla/datos

      // Captura del resultado (ajusta según los datos que extraes del SGA)
      const inscriptos = await page.innerText('body');

      resultados.push({
        codigo: codigo,
        estado: 'Procesado',
        detalle: inscriptos.substring(0, 100) // snippet de resultado
      });
    }

    // 5. Enviar resultados consolidados a Google Sheets
    console.log('Enviando resultados a Google Sheets...');
    await fetch(process.env.SHEETS_POST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resultados)
    });

    console.log('Proceso completado con éxito.');

  } catch (error) {
    console.error('Error durante la ejecución del bot:', error.message);
  } finally {
    await browser.close();
    console.log('Navegador cerrado.');
  }
})();
