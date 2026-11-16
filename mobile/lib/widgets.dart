import 'package:flutter/material.dart';

import 'models.dart';
import 'theme.dart';

class KindStyle {
  const KindStyle(this.background, this.border, this.text);
  final Color background;
  final Color border;
  final Color text;

  static KindStyle of(GuestKind kind) => switch (kind) {
        GuestKind.expected => const KindStyle(AppColors.expectedSoft, Color(0xFFECD3A3), AppColors.ink),
        GuestKind.late => const KindStyle(AppColors.signalSoft, Color(0xFFF0C3AE), AppColors.ink),
        GuestKind.arrived => const KindStyle(AppColors.clearedSoft, Color(0xFFB6DBC4), AppColors.clearedInk),
        GuestKind.gone => const KindStyle(AppColors.idleSoft, Color(0xFFD9D6D0), AppColors.idle),
      };

  static bool struck(GuestKind kind) => kind == GuestKind.arrived || kind == GuestKind.gone;
}

TextStyle struckStyle(TextStyle base, bool struck) => struck
    ? base.copyWith(decoration: TextDecoration.lineThrough, decorationThickness: 1.6)
    : base;

class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.guest, this.late = false});
  final Guest guest;
  final bool late;

  @override
  Widget build(BuildContext context) {
    final (bg, fg, label) = late
        ? (AppColors.signalSoft, AppColors.signalDeep, 'Late')
        : switch (guest.status) {
            'ARRIVED' || 'CLEARED' => (AppColors.clearedSoft, AppColors.cleared, 'Checked in'),
            'CANCELLED' => (AppColors.idleSoft, AppColors.idle, 'Cancelled'),
            'NO_SHOW' => (AppColors.dangerSoft, AppColors.danger, 'No-show'),
            _ => (AppColors.expectedSoft, AppColors.expected, 'Expected'),
          };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(label, style: TextStyle(color: fg, fontSize: 11.5, fontWeight: FontWeight.w700)),
    );
  }
}

/// A license plate, styled like a plate so it's easy to spot.
class PlateTag extends StatelessWidget {
  const PlateTag(this.plate, {super.key, this.large = false});
  final String plate;
  final bool large;

  @override
  Widget build(BuildContext context) => Container(
        padding: EdgeInsets.symmetric(horizontal: large ? 10 : 6, vertical: large ? 4 : 1),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: AppColors.ink.withValues(alpha: 0.7)),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          plate,
          style: TextStyle(
            fontFamily: 'monospace',
            fontWeight: FontWeight.w700,
            letterSpacing: 1,
            fontSize: large ? 16 : 12,
            color: AppColors.ink,
          ),
        ),
      );
}

class CarLine extends StatelessWidget {
  const CarLine({super.key, required this.guest});
  final Guest guest;

  @override
  Widget build(BuildContext context) => Wrap(
        spacing: 6,
        runSpacing: 4,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          const Icon(Icons.directions_car_outlined, size: 16, color: AppColors.muted),
          if (guest.licensePlate?.isNotEmpty ?? false) PlateTag(guest.licensePlate!),
          if (guest.vehicle?.isNotEmpty ?? false)
            Text(guest.vehicle!, style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
        ],
      );
}

class EmptyMessage extends StatelessWidget {
  const EmptyMessage({super.key, required this.icon, required this.title, this.body, this.action});
  final IconData icon;
  final String title;
  final String? body;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(color: AppColors.idleSoft, borderRadius: BorderRadius.circular(16)),
              child: Icon(icon, color: AppColors.muted),
            ),
            const SizedBox(height: 14),
            Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
            if (body != null) ...[
              const SizedBox(height: 6),
              Text(body!, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted)),
            ],
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      );
}

class ErrorBanner extends StatelessWidget {
  const ErrorBanner({super.key, required this.message, this.onRetry});
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
        decoration: BoxDecoration(color: AppColors.dangerSoft, borderRadius: BorderRadius.circular(12)),
        child: Row(
          children: [
            const Icon(Icons.error_outline, color: AppColors.danger, size: 20),
            const SizedBox(width: 10),
            Expanded(child: Text(message, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w500))),
            if (onRetry != null) TextButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      );
}

void showMessage(BuildContext context, String message, {String? actionLabel, VoidCallback? onAction}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message),
        action: actionLabel != null && onAction != null ? SnackBarAction(label: actionLabel, onPressed: onAction) : null,
      ),
    );
}
