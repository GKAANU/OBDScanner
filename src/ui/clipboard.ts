import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';

/**
 * Copy plain text to the clipboard. Never throws: on failure it tells the
 * user (in Turkish) and resolves false, so callers can skip "Kopyalandı".
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    Alert.alert('Kopyalanamadı', 'Panoya yazılamadı. Tekrar dene.');
    return false;
  }
}
