import { HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold } from "@expo-google-fonts/hanken-grotesk";
import { IMFellEnglish_400Regular, IMFellEnglish_400Regular_Italic } from "@expo-google-fonts/im-fell-english";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { locate } from "@/state/data";
import { usePalette, useSky } from "@/state/store";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Root() {
  const palette = usePalette();
  const [loaded] = useFonts({
    IMFellEnglish_400Regular,
    IMFellEnglish_400Regular_Italic,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  // Ask where we are once, unless a place was chosen by hand.
  useEffect(() => {
    const unsub = useSky.persist.onFinishHydration((st) => {
      if (st.place.source !== "chosen" || st.place.name === "Dhaka") locate();
    });
    if (useSky.persist.hasHydrated()) {
      const st = useSky.getState();
      if (st.place.source !== "chosen" || st.place.name === "Dhaka") locate();
    }
    return unsub;
  }, []);

  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.sky }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.sky } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="place" options={{ presentation: "modal" }} />
          <Stack.Screen name="about" options={{ presentation: "modal" }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
