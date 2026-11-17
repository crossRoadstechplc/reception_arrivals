import 'package:flutter/material.dart';

/// Colours from the Arrival Desk website, so the app feels like the same product.
class AppColors {
  static const ink = Color(0xFF14201B);
  static const inkSoft = Color(0xFF24312B);
  static const signal = Color(0xFFD85A2A);
  static const signalDeep = Color(0xFFB4461B);
  static const signalSoft = Color(0xFFFBE9E1);
  static const paper = Color(0xFFF4F2EE);
  static const panel = Color(0xFFFFFFFF);
  static const panel2 = Color(0xFFFAF9F6);
  static const line = Color(0xFFE4DFD6);
  static const lineStrong = Color(0xFFCFC8BC);
  static const muted = Color(0xFF646D67);
  static const expected = Color(0xFF9A6410);
  static const expectedSoft = Color(0xFFFBF1DF);
  static const cleared = Color(0xFF1D7A4A);
  static const clearedSoft = Color(0xFFE0F2E7);
  static const clearedInk = Color(0xFF2C5A41);
  static const idle = Color(0xFF5F6561);
  static const idleSoft = Color(0xFFEEEDEA);
  static const danger = Color(0xFFB03434);
  static const dangerSoft = Color(0xFFFBE6E6);
  static const admin = Color(0xFF6A46B8);
  static const adminSoft = Color(0xFFEFE9FB);
}

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: AppColors.signal,
    primary: AppColors.signal,
    onPrimary: Colors.white,
    secondary: AppColors.ink,
    surface: AppColors.panel,
    onSurface: AppColors.ink,
    error: AppColors.danger,
  );
  final base = ThemeData(useMaterial3: true, colorScheme: scheme);
  const radius = BorderRadius.all(Radius.circular(12));
  return base.copyWith(
    scaffoldBackgroundColor: AppColors.paper,
    textTheme: base.textTheme.apply(bodyColor: AppColors.ink, displayColor: AppColors.ink),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.panel,
      foregroundColor: AppColors.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      centerTitle: false,
    ),
    dividerTheme: const DividerThemeData(color: AppColors.line, space: 1, thickness: 1),
    cardTheme: const CardThemeData(
      color: AppColors.panel,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(16)),
        side: BorderSide(color: AppColors.line),
      ),
    ),
    inputDecorationTheme: const InputDecorationTheme(
      filled: true,
      fillColor: AppColors.panel,
      contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: radius,
        borderSide: BorderSide(color: AppColors.lineStrong),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: BorderSide(color: AppColors.lineStrong),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: BorderSide(color: AppColors.ink, width: 1.6),
      ),
      labelStyle: TextStyle(color: AppColors.muted),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.signal,
        foregroundColor: Colors.white,
        minimumSize: const Size(48, 48),
        shape: const RoundedRectangleBorder(borderRadius: radius),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.ink,
        minimumSize: const Size(48, 48),
        side: const BorderSide(color: AppColors.lineStrong),
        shape: const RoundedRectangleBorder(borderRadius: radius),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppColors.ink,
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.panel,
      indicatorColor: AppColors.signalSoft,
      surfaceTintColor: Colors.transparent,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: states.contains(WidgetState.selected) ? AppColors.ink : AppColors.muted,
        ),
      ),
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: AppColors.signal,
      foregroundColor: Colors.white,
    ),
    snackBarTheme: const SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: AppColors.ink,
      actionTextColor: Color(0xFFF4B39A),
    ),
    timePickerTheme: const TimePickerThemeData(
      dialBackgroundColor: AppColors.panel2,
      hourMinuteColor: AppColors.signalSoft,
      hourMinuteTextColor: AppColors.signalDeep,
      dialHandColor: AppColors.signal,
    ),
  );
}
