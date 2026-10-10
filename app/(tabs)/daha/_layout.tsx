import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '../../../src/ui/theme';

export default function DahaLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
