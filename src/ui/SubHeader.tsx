import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Icon } from './icons';
import { colors, fonts } from './theme';

/** "< Daha fazla" back link + page title for the Daha fazla sub-pages. */
export function SubHeader({ title, sub, backLabel = 'Daha fazla' }: { title: string; sub?: string; backLabel?: string }) {
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/daha');
  };
  return (
    <View>
      <Pressable onPress={goBack} hitSlop={8} style={styles.back}>
        <Icon name="chevronLeft" size={20} color={colors.blue} stroke={2.2} />
        <Text style={styles.backText}>{backLabel}</Text>
      </Pressable>
      <Text style={styles.title}>{title}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 8, marginLeft: -6, alignSelf: 'flex-start' },
  backText: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 16 },
  title: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 28, lineHeight: 32, letterSpacing: -0.85, marginTop: 2 },
  sub: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 8 },
});

/** "Bağlı değil" card for pages that need the dongle. */
export function ConnectCard({ title, body }: { title: string; body: string }) {
  return (
    <View style={cardStyles.card}>
      <Text style={cardStyles.title}>{title}</Text>
      <Text style={cardStyles.body}>{body}</Text>
      <Pressable onPress={() => router.push('/baglan')} style={({ pressed }) => [cardStyles.btn, pressed && { opacity: 0.75 }]}>
        <Text style={cardStyles.btnText}>Bağlan</Text>
      </Pressable>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    marginTop: 18,
    backgroundColor: colors.cardHi,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 22,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  title: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 17, textAlign: 'center' },
  body: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 6, textAlign: 'center' },
  btn: { marginTop: 16, height: 44, paddingHorizontal: 22, borderRadius: 14, backgroundColor: colors.blue, justifyContent: 'center' },
  btnText: { color: '#fff', fontFamily: fonts.bodySemiBold, fontSize: 15 },
});
