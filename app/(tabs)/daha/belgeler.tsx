import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useGarage } from '../../../src/garage/store';
import { useDueDates } from '../../../src/garage/usePlan';
import { DOC_KINDS, daysText } from '../../../src/garage/dates';
import type { DocDate, DocKind } from '../../../src/garage/types';
import { Copyable } from '../../../src/ui/copy';
import { Icon } from '../../../src/ui/icons';
import { Button, Ring, Screen, Sheet } from '../../../src/ui/primitives';
import { colors, fonts, tabular } from '../../../src/ui/theme';
import { formatDateTR, parseDateTR } from '../../../src/utils/format';

type Draft = { id?: string; kind: DocKind; name: string; date: string; note: string };

export default function BelgelerScreen() {
  const { docs, upsertDoc, deleteDoc } = useGarage();
  const rows = useDueDates();
  const [draft, setDraft] = useState<Draft | null>(null);

  const missing = DOC_KINDS.filter((k) => !docs.some((d) => d.kind === k.kind));

  const openDoc = (d: DocDate) => setDraft({ id: d.id, kind: d.kind, name: d.name, date: formatDateTR(d.date), note: d.note });

  const save = () => {
    if (!draft) return;
    const iso = parseDateTR(draft.date);
    if (!iso) {
      Alert.alert('Geçersiz tarih', 'Tarihi GG.AA.YYYY biçiminde gir.');
      return;
    }
    const name = draft.name.trim();
    if (!name) {
      Alert.alert('Eksik bilgi', 'Bir ad gir.');
      return;
    }
    upsertDoc({ id: draft.id, kind: draft.kind, name, date: iso, note: draft.note.trim() });
    setDraft(null);
  };

  return (
    <Screen contentStyle={{ paddingTop: 2 }}>
      <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
        <Icon name="chevronLeft" size={20} color={colors.blue} stroke={2.2} />
        <Text style={styles.backText}>Daha fazla</Text>
      </Pressable>
      <Text style={styles.title}>Belgeler ve tarihler</Text>
      <Text style={styles.lede}>Tarihler bu iPhone'da saklanır. Dokunarak düzenle, basılı tutarak kopyala.</Text>
      <Pressable onPress={() => router.push('/daha/hatirlatmalar')} style={styles.remind} hitSlop={6}>
        <Icon name="clock" size={15} color={colors.blue} />
        <Text style={styles.addText}>Hatırlatmaları yönet</Text>
      </Pressable>

      <View style={styles.list}>
        {rows.map((r) => {
          const c = r.days < 0 ? colors.error : r.days <= 30 ? colors.amber : colors.text;
          const ring = r.days < 0 ? colors.error : r.days <= 30 ? colors.amber : colors.ok;
          const doc = docs.find((d) => d.id === r.id);
          return (
            <Copyable
              key={r.id}
              text={`${r.name}: ${formatDateTR(r.date)} (${daysText(r.days)}${r.days > 0 ? ' kaldı' : ''})`}
              onPress={doc ? () => openDoc(doc) : undefined}
              style={styles.card}
            >
              <Ring value={r.elapsed} size={52} stroke={5} color={ring} />
              <View style={styles.flex}>
                <Text style={styles.name}>{r.name}</Text>
                <Text style={[styles.sub, tabular]}>
                  {formatDateTR(r.date)} · {r.auto ? `${r.note} · Otomatik` : r.note || '—'}
                </Text>
              </View>
              <View style={styles.right}>
                <Text style={[styles.days, { color: c }, tabular]}>{r.days < 0 ? -r.days : r.days}</Text>
                <Text style={styles.daysUnit}>{r.days < 0 ? 'gün geçti' : 'gün'}</Text>
              </View>
            </Copyable>
          );
        })}
      </View>

      <View style={styles.adds}>
        {missing.map((k) => (
          <Pressable
            key={k.kind}
            onPress={() => setDraft({ kind: k.kind, name: k.name, date: '', note: k.note })}
            style={styles.add}
          >
            <Icon name="plus" size={16} color={colors.blue} />
            <Text style={styles.addText}>{k.name} ekle</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setDraft({ kind: 'custom', name: '', date: '', note: '' })} style={styles.add}>
          <Icon name="plus" size={16} color={colors.blue} />
          <Text style={styles.addText}>Başka tarih ekle</Text>
        </Pressable>
      </View>

      <Sheet visible={!!draft} onClose={() => setDraft(null)}>
        {draft ? (
          <View>
            <View style={styles.sheetHead}>
              <Pressable onPress={() => setDraft(null)} hitSlop={8}>
                <Text style={styles.headBtn}>Vazgeç</Text>
              </Pressable>
              <Text style={styles.headTitle}>{draft.id ? 'Düzenle' : 'Yeni tarih'}</Text>
              <Pressable onPress={save} hitSlop={8}>
                <Text style={[styles.headBtn, { fontFamily: fonts.bodySemiBold }]}>Kaydet</Text>
              </Pressable>
            </View>
            <View style={styles.form}>
              <Field
                label="Ad"
                value={draft.name}
                onChange={(v) => setDraft({ ...draft, name: v })}
                ph="Örn. Egzoz emisyon"
                editable={draft.kind === 'custom'}
              />
              <Field
                label="Tarih"
                value={draft.date}
                onChange={(v) => setDraft({ ...draft, date: v })}
                ph="02.11.2026"
                border
                numeric
              />
              <Field label="Not" value={draft.note} onChange={(v) => setDraft({ ...draft, note: v })} ph="İsteğe bağlı" border />
            </View>
            <Text style={styles.hint}>Bitiş veya son ödeme tarihini GG.AA.YYYY biçiminde gir.</Text>
            {draft.id ? (
              <Button
                label="Sil"
                variant="dangerSoft"
                onPress={() => {
                  if (draft.id) deleteDoc(draft.id);
                  setDraft(null);
                }}
                style={{ marginTop: 18, height: 46 }}
              />
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
  ph,
  border,
  numeric,
  editable = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  ph: string;
  border?: boolean;
  numeric?: boolean;
  editable?: boolean;
}) {
  return (
    <View style={[styles.fRow, border && styles.fBorder]}>
      <Text style={styles.fLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={ph}
        placeholderTextColor={colors.faint}
        keyboardType={numeric ? 'numbers-and-punctuation' : 'default'}
        editable={editable}
        style={[styles.fInput, !editable && { color: colors.muted }, tabular]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  remind: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start' },
  flex: { flex: 1, minWidth: 0 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 8, marginLeft: -6, alignSelf: 'flex-start' },
  backText: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 16 },
  title: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 28, letterSpacing: -0.85, marginTop: 2 },
  lede: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 8 },
  list: { gap: 10, marginTop: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  name: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 },
  sub: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  days: { fontFamily: fonts.bodySemiBold, fontSize: 24, lineHeight: 26 },
  daysUnit: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  adds: { marginTop: 16, gap: 8 },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
  },
  addText: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 15 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headBtn: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 16 },
  headTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  form: { marginTop: 18, backgroundColor: colors.sheetInner, borderRadius: 16, overflow: 'hidden' },
  fRow: { flexDirection: 'row', alignItems: 'center', height: 50, paddingHorizontal: 14 },
  fBorder: { borderTopWidth: 1, borderTopColor: colors.line2 },
  fLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, width: 70 },
  fInput: { flex: 1, color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15, textAlign: 'right', paddingVertical: 0 },
  hint: { color: colors.faint, fontFamily: fonts.body, fontSize: 12.5, marginTop: 10 },
});
