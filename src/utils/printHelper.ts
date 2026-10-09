/**
 * Dedicated Print Helper for AI Studio Web Environment
 * Isolates the targeted print container so that the background webpage,
 * navigation bars, and modals are never printed.
 */

/**
 * Dedicated Booking Receipt Print Document Generator
 * Creates an isolated HTML document in an off-screen iframe containing ONLY
 * the booking receipt, formatted for standard A4 portrait printing.
 *
 * Guarantees:
 * - NO Navbar, Sidebar, Modal Background, Admin UI, or background webpage.
 * - A4 Portrait sizing with proper print margins.
 * - Complete waiting for fonts (SF Pro TH, SF Pro Text, Display, etc.) and images.
 * - NEVER falls back to window.print() on the parent/main window.
 */
export async function printBookingReceiptDocument(
  element: HTMLElement | null,
  title: string = 'ใบเสร็จรับเงินจองห้องชุด'
): Promise<boolean> {
  if (!element) {
    console.error('printBookingReceiptDocument: Element is null');
    return false;
  }

  // 1. Wait for fonts in the main document to be ready before cloning
  if (document.fonts) {
    try {
      await document.fonts.ready;
    } catch (e) {
      console.warn('document.fonts.ready error:', e);
    }
  }

  return new Promise<boolean>((resolve) => {
    try {
      // 2. Create isolated print iframe
      const iframe = document.createElement('iframe');
      iframe.id = 'isolated-booking-print-frame';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '10px';
      iframe.style.height = '10px';
      iframe.style.opacity = '0.01';
      iframe.style.pointerEvents = 'none';
      iframe.style.border = 'none';
      iframe.style.zIndex = '-99999';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        console.error('Cannot access iframe document');
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
        resolve(false);
        return;
      }

      // 3. Extract all stylesheet links and style tags from current page
      let stylesMarkup = '';
      document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
        stylesMarkup += node.outerHTML + '\n';
      });

      // 4. Clone the receipt element cleanly
      const clonedElement = element.cloneNode(true) as HTMLElement;
      clonedElement.style.boxShadow = 'none';
      clonedElement.style.border = 'none';
      clonedElement.style.margin = '0 auto';
      clonedElement.style.width = '100%';
      clonedElement.style.maxWidth = '100%';
      clonedElement.style.minHeight = 'auto';
      clonedElement.style.background = '#ffffff';
      clonedElement.style.padding = '0';

      // Ensure form inputs in clone retain values
      const origInputs = element.querySelectorAll('input, select, textarea');
      const clonedInputs = clonedElement.querySelectorAll('input, select, textarea');
      origInputs.forEach((orig, idx) => {
        const cloned = clonedInputs[idx] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        if (!cloned) return;
        if (orig instanceof HTMLInputElement && cloned instanceof HTMLInputElement) {
          cloned.setAttribute('value', orig.value);
          cloned.defaultValue = orig.value;
        } else if (orig instanceof HTMLTextAreaElement && cloned instanceof HTMLTextAreaElement) {
          cloned.textContent = orig.value;
          cloned.defaultValue = orig.value;
        } else if (orig instanceof HTMLSelectElement && cloned instanceof HTMLSelectElement) {
          cloned.setAttribute('value', orig.value);
          cloned.value = orig.value;
        }
      });

      // 5. Construct pristine standalone HTML document
      const htmlContent = `
<!DOCTYPE html>
<html lang="th">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    ${stylesMarkup}
    <style>
      @page {
        size: A4 portrait;
        margin: 6mm 8mm;
      }
      *, *::before, *::after {
        box-sizing: border-box !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #1c1917 !important;
        width: 100% !important;
        min-height: 100% !important;
        font-family: "SF Pro Text", "SF Pro TH", "Sukhumvit Set", "IBM Plex Sans Thai", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      }
      .no-print {
        display: none !important;
      }
      #print-receipt-wrapper {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 auto !important;
        padding: 0 !important;
        background: #ffffff !important;
        display: block !important;
      }
      #booking-receipt-canvas {
        width: 100% !important;
        max-width: 100% !important;
        min-height: auto !important;
        box-shadow: none !important;
        border: none !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
      }
    </style>
  </head>
  <body>
    <div id="print-receipt-wrapper">
      ${clonedElement.outerHTML}
    </div>
  </body>
</html>
      `;

      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      const cleanup = () => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      };

      const triggerPrint = async () => {
        try {
          // Wait for iframe fonts to be loaded
          if (iframeDoc.fonts) {
            try {
              await iframeDoc.fonts.ready;
            } catch (e) {
              console.warn('iframeDoc.fonts.ready error:', e);
            }
          }

          // Small settlement delay for layout & typography
          await new Promise((r) => setTimeout(r, 120));

          const iframeWin = iframe.contentWindow;
          if (!iframeWin) {
            cleanup();
            resolve(false);
            return;
          }

          iframeWin.focus();
          iframeWin.print();
          resolve(true);
        } catch (err) {
          console.error('Failed to print from iframe:', err);
          // CRITICAL: NEVER call window.print() on main window!
          resolve(false);
        } finally {
          setTimeout(() => {
            cleanup();
          }, 3000);
        }
      };

      // Check all images in the iframe document
      const iframeImages = Array.from(iframeDoc.images);
      if (iframeImages.length === 0) {
        setTimeout(triggerPrint, 200);
      } else {
        let loadedCount = 0;
        const total = iframeImages.length;
        const onImageDone = () => {
          loadedCount++;
          if (loadedCount >= total) {
            triggerPrint();
          }
        };

        iframeImages.forEach((img) => {
          if (img.complete) {
            onImageDone();
          } else {
            img.onload = onImageDone;
            img.onerror = onImageDone;
          }
        });

        // Safety timeout to avoid hanging indefinitely if an image takes too long
        setTimeout(() => {
          if (loadedCount < total) {
            triggerPrint();
          }
        }, 1500);
      }
    } catch (err) {
      console.error('printBookingReceiptDocument exception:', err);
      // CRITICAL: NEVER call window.print() on main window!
      resolve(false);
    }
  });
}

/**
 * Dedicated Room Poster / Horizontal Flyer Print Document Generator
 * Creates an isolated HTML document in an off-screen iframe containing ONLY
 * the room flyer poster, formatted for standard A4 landscape printing.
 *
 * Guarantees:
 * - A4 Landscape poster, full-page fit (1 page, no multi-page bleed).
 * - Only the Poster/Flyer is printed.
 * - NO Navbar, Admin sidebar, Modal background, action buttons, or main webpage.
 * - NEVER falls back to window.print() on the main window.
 * - Waits for all poster photos and fonts to fully load before triggering print.
 */
export async function printRoomFlyerDocument(
  element: HTMLElement | null,
  title: string = 'ใบนำเสนอห้องชุด'
): Promise<boolean> {
  if (!element) {
    console.error('printRoomFlyerDocument: Element is null');
    return false;
  }

  // 1. Wait for source images to finish loading in main document
  const sourceImages = Array.from(element.querySelectorAll('img'));
  if (sourceImages.length > 0) {
    await Promise.all(
      sourceImages.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise<void>((res) => {
          img.onload = () => res();
          img.onerror = () => res();
          setTimeout(res, 2500); // 2.5s fallback
        });
      })
    );
  }

  // 2. Wait for fonts in main document
  if (document.fonts) {
    try {
      await document.fonts.ready;
    } catch (e) {
      console.warn('document.fonts.ready error:', e);
    }
  }

  return new Promise<boolean>((resolve) => {
    try {
      // 3. Create isolated print iframe
      const iframe = document.createElement('iframe');
      iframe.id = 'isolated-flyer-print-frame';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '10px';
      iframe.style.height = '10px';
      iframe.style.opacity = '0.01';
      iframe.style.pointerEvents = 'none';
      iframe.style.border = 'none';
      iframe.style.zIndex = '-99999';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        console.error('Cannot access iframe document for room flyer print');
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
        resolve(false);
        return;
      }

      // 4. Extract styles from current document
      let stylesMarkup = '';
      document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
        stylesMarkup += node.outerHTML + '\n';
      });

      // 5. Clone flyer element and reset container styles for A4 landscape fitting
      const clonedElement = element.cloneNode(true) as HTMLElement;
      clonedElement.style.boxShadow = 'none';
      clonedElement.style.border = 'none';
      clonedElement.style.borderRadius = '0';
      clonedElement.style.margin = '0 auto';
      clonedElement.style.width = '100%';
      clonedElement.style.maxWidth = '100%';
      clonedElement.style.minHeight = '0';
      clonedElement.style.height = '100%';
      clonedElement.style.background = '#ffffff';

      // 6. Build isolated HTML document
      const htmlContent = `
<!DOCTYPE html>
<html lang="th">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    ${stylesMarkup}
    <style>
      @page {
        size: A4 landscape;
        margin: 4mm 6mm;
      }
      *, *::before, *::after {
        box-sizing: border-box !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #1c1917 !important;
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
        font-family: "SF Pro Text", "SF Pro TH", "Sukhumvit Set", "IBM Plex Sans Thai", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      }
      .no-print {
        display: none !important;
      }
      #flyer-print-wrapper {
        width: 100% !important;
        height: 100% !important;
        max-width: 100% !important;
        margin: 0 auto !important;
        padding: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
        background: #ffffff !important;
        overflow: hidden !important;
      }
      #horizontal-flyer-canvas {
        width: 100% !important;
        max-width: 100% !important;
        height: 100% !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 10px 14px !important;
        border: none !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        background: #ffffff !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    </style>
  </head>
  <body>
    <div id="flyer-print-wrapper">
      ${clonedElement.outerHTML}
    </div>
  </body>
</html>
      `;

      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      const cleanup = () => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      };

      const triggerPrint = async () => {
        try {
          if (iframeDoc.fonts) {
            try {
              await iframeDoc.fonts.ready;
            } catch (e) {
              console.warn('iframeDoc.fonts.ready error:', e);
            }
          }

          // Small settlement delay for layout & typography
          await new Promise((r) => setTimeout(r, 150));

          const iframeWin = iframe.contentWindow;
          if (!iframeWin) {
            cleanup();
            resolve(false);
            return;
          }

          iframeWin.focus();
          iframeWin.print();
          resolve(true);
        } catch (err) {
          console.error('Failed to print flyer from iframe:', err);
          // CRITICAL: NEVER call window.print() on main window!
          resolve(false);
        } finally {
          setTimeout(() => {
            cleanup();
          }, 3000);
        }
      };

      // Check all images in the iframe document
      const iframeImages = Array.from(iframeDoc.images);
      if (iframeImages.length === 0) {
        setTimeout(triggerPrint, 250);
      } else {
        let loadedCount = 0;
        const total = iframeImages.length;
        const onImageDone = () => {
          loadedCount++;
          if (loadedCount >= total) {
            triggerPrint();
          }
        };

        iframeImages.forEach((img) => {
          if (img.complete && img.naturalWidth > 0) {
            onImageDone();
          } else {
            img.onload = onImageDone;
            img.onerror = onImageDone;
          }
        });

        // Safety timeout so it doesn't block indefinitely
        setTimeout(() => {
          if (loadedCount < total) {
            triggerPrint();
          }
        }, 2500);
      }
    } catch (err) {
      console.error('printRoomFlyerDocument exception:', err);
      // CRITICAL: NEVER call window.print() on main window!
      resolve(false);
    }
  });
}

export function printIsolatedElement(
  element: HTMLElement | null, 
  title: string = 'พิมพ์เอกสาร', 
  isLandscape: boolean = false
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!element) {
      resolve(false);
      return;
    }

    try {
      // Create a hidden iframe
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.top = '0';
      iframe.style.left = '0';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.style.opacity = '0.01';
      iframe.style.pointerEvents = 'none';
      iframe.style.border = 'none';
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        document.body.removeChild(iframe);
        resolve(false);
        return;
      }

      // Collect all active stylesheets and style tags
      let styleMarkup = '';
      const styles = document.querySelectorAll('link[rel="stylesheet"], style');
      styles.forEach(el => {
        styleMarkup += el.outerHTML;
      });

      // Clone target element
      const clonedElement = element.cloneNode(true) as HTMLElement;
      // Strip any unwanted classes that could restrict sizing in print
      clonedElement.style.margin = '0 auto';
      clonedElement.style.boxShadow = 'none';
      clonedElement.style.border = 'none';

      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html lang="th">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}</title>
            ${styleMarkup}
            <style>
              @page {
                size: A4 ${isLandscape ? 'landscape' : 'portrait'};
                margin: ${isLandscape ? '0' : '6mm'};
              }
              *, *::before, *::after {
                box-sizing: border-box;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #000000 !important;
                width: 100% !important;
                height: 100% !important;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              }
              .no-print {
                display: none !important;
              }
              /* Print container isolation */
              #print-target-wrapper {
                width: 100% !important;
                max-width: 100% !important;
                margin: 0 auto !important;
                padding: 0 !important;
                display: block !important;
              }
            </style>
          </head>
          <body>
            <div id="print-target-wrapper">
              ${clonedElement.outerHTML}
            </div>
          </body>
        </html>
      `);
      iframeDoc.close();

      const triggerPrint = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.warn('Iframe print error:', e);
        } finally {
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
            resolve(true);
          }, 1500);
        }
      };

      // Wait for images inside iframe to load if any
      const iframeImages = iframeDoc.querySelectorAll('img');
      if (iframeImages.length === 0) {
        setTimeout(triggerPrint, 350);
      } else {
        let loaded = 0;
        const total = iframeImages.length;
        const checkDone = () => {
          loaded++;
          if (loaded >= total) triggerPrint();
        };
        iframeImages.forEach(img => {
          if (img.complete) {
            checkDone();
          } else {
            img.onload = checkDone;
            img.onerror = checkDone;
          }
        });
        // Safety timeout if images take too long
        setTimeout(triggerPrint, 1200);
      }
    } catch (err) {
      console.error('Print isolated element failed:', err);
      resolve(false);
    }
  });
}
