// On the web, Skia runs on CanvasKit (WebAssembly), which has to load
// before anything draws.
import "@expo/metro-runtime";
import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import { App } from "expo-router/build/qualified-entry";
import { renderRootComponent } from "expo-router/build/renderRootComponent";

LoadSkiaWeb({ locateFile: () => "/canvaskit.wasm" }).then(() => renderRootComponent(App));
