# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# --- Tauri -----------------------------------------------------------------
# The Rust side reaches these classes over JNI, by name. R8 sees no caller and
# would rename or delete them, which fails at runtime in release builds only.
-keep class app.tauri.** { *; }
-keep class com.sws2apps.organized.** { *; }

# Plugin commands are dispatched by their annotated name.
-keepclassmembers class * {
    @app.tauri.annotation.Command <methods>;
}

# The webview bridge is instantiated reflectively.
-keep class * extends android.webkit.WebView { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# --- Compile-time-only annotations ------------------------------------------
# okio, and transitively anything built on it, references JSR-305 annotations
# that are never packaged because they are not needed at runtime. R8 counts
# them as missing classes and fails the build rather than warning.
-dontwarn javax.annotation.**
-dontwarn javax.annotation.concurrent.**
