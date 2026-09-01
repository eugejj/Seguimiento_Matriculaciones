console.log(`📤 Enviando a Sheets: ${codigo} -> ${confirmados}`);

      try {
        const postRes = await fetch(SHEETS_POST, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain;charset=utf-8"
          },
          body: JSON.stringify({
            codigo: codigo,
            confirmados: confirmados
          }),
          redirect: 'follow' // CRÍTICO: Obliga a Fetch a seguir la redirección 302 de Google Apps Script
        });

        console.log("STATUS ENVÍO SHEETS:", postRes.status);
      } catch (errPost) {
        console.error("❌ Error enviando resultado a Sheets:", errPost.message);
      }
