import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/** A4 at 72 dpi. */
const A4 = { width: 595, height: 842 };

/**
 * Render `html` to a PDF in the app cache and open the share sheet.
 * Resolves false (never throws) when rendering or sharing is unavailable.
 */
export async function sharePdf(html: string, title: string): Promise<boolean> {
  try {
    const { uri } = await Print.printToFileAsync({ html, ...A4 });
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
    return true;
  } catch {
    return false;
  }
}
